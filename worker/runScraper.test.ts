import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { REPO_ROOT, runScraper, ScraperError, type ChildLike, type SpawnFn } from "./runScraper";

type FakeChild = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  kill: Mock<(signal?: NodeJS.Signals) => boolean>;
  finish(code: number | null, signal?: NodeJS.Signals | null): void;
};

function fakeChild(): FakeChild {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(emitter, {
    stdout,
    stderr,
    kill: vi.fn<(signal?: NodeJS.Signals) => boolean>(() => true),
    finish(code: number | null, signal: NodeJS.Signals | null = null) {
      stdout.end();
      stderr.end();
      setImmediate(() => emitter.emit("close", code, signal));
    },
  });
  return child;
}

function spawnReturning(child: FakeChild): { spawnFn: SpawnFn; calls: Array<Parameters<SpawnFn>> } {
  const calls: Array<Parameters<SpawnFn>> = [];
  const spawnFn: SpawnFn = (...args) => {
    calls.push(args);
    return child as unknown as ChildLike;
  };
  return { spawnFn, calls };
}

const RUN = { run_at: "2026-11-07T12:00:00Z", companies: [] };

describe("runScraper", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spawns python3 -m scraper from the repo root and parses stdout", async () => {
    const child = fakeChild();
    const { spawnFn, calls } = spawnReturning(child);
    const pending = runScraper({ spawnFn });
    child.stdout.write(JSON.stringify(RUN).slice(0, 10));
    child.stdout.write(JSON.stringify(RUN).slice(10));
    child.stderr.write("fetched 0 jobs\n");
    child.finish(0);

    const result = await pending;

    expect(result).toEqual({ json: RUN, exitCode: 0, stderr: "fetched 0 jobs\n" });
    const [command, args, options] = calls[0];
    expect(command).toBe("python3");
    expect(args).toEqual(["-m", "scraper", "--companies", "scraper/companies.json", "--out", "-"]);
    expect(options.cwd).toBe(REPO_ROOT);
  });

  it("passes extra args and a custom interpreter", async () => {
    const child = fakeChild();
    const { spawnFn, calls } = spawnReturning(child);
    const pending = runScraper({ spawnFn, python: "/usr/bin/python3.12", extraArgs: ["--company", "Stripe"] });
    child.stdout.write(JSON.stringify(RUN));
    child.finish(0);
    await pending;
    expect(calls[0][0]).toBe("/usr/bin/python3.12");
    expect(calls[0][1].slice(-2)).toEqual(["--company", "Stripe"]);
  });

  it("accepts exit code 1 (every company failed) because the JSON is still written", async () => {
    const child = fakeChild();
    const { spawnFn } = spawnReturning(child);
    const pending = runScraper({ spawnFn });
    child.stdout.write(JSON.stringify(RUN));
    child.finish(1);
    await expect(pending).resolves.toMatchObject({ exitCode: 1, json: RUN });
  });

  it("surfaces stderr when the scraper exits with a usage/config error", async () => {
    const child = fakeChild();
    const { spawnFn } = spawnReturning(child);
    const pending = runScraper({ spawnFn });
    child.stderr.write("error: companies.json: unknown key 'bord'\n");
    child.finish(2);

    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ScraperError);
    expect((error as ScraperError).message).toMatch(/exited with code 2.*unknown key 'bord'/s);
    expect((error as ScraperError).stderr).toContain("unknown key 'bord'");
  });

  it("rejects stdout that is not JSON and includes stderr", async () => {
    const child = fakeChild();
    const { spawnFn } = spawnReturning(child);
    const pending = runScraper({ spawnFn });
    child.stdout.write("Traceback (most recent call last)");
    child.stderr.write("boom\n");
    child.finish(0);
    await expect(pending).rejects.toThrow(/not valid JSON.*boom/s);
  });

  it("rejects when the process cannot be started", async () => {
    const child = fakeChild();
    const { spawnFn } = spawnReturning(child);
    const pending = runScraper({ spawnFn });
    child.emit("error", Object.assign(new Error("spawn python3 ENOENT"), { code: "ENOENT" }));
    await expect(pending).rejects.toThrow(/could not start python3.*ENOENT/);
  });

  it("rejects when the spawn function itself throws", async () => {
    const spawnFn: SpawnFn = () => {
      throw new Error("EACCES");
    };
    await expect(runScraper({ spawnFn })).rejects.toThrow(/could not start python3.*EACCES/);
  });

  it("kills the process after the timeout, escalating to SIGKILL", async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const { spawnFn } = spawnReturning(child);
    const pending = runScraper({ spawnFn, timeoutMs: 1000, killGraceMs: 500 });
    const settled = pending.catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(1000);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(500);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");

    const error = await settled;
    expect(error).toBeInstanceOf(ScraperError);
    expect((error as Error).message).toMatch(/timed out after 1s/);
  });

  it("kills the process and rejects when stdout exceeds the size limit", async () => {
    const child = fakeChild();
    const { spawnFn } = spawnReturning(child);
    const pending = runScraper({ spawnFn, maxOutputBytes: 10 });
    child.stdout.write("x".repeat(11));
    await new Promise((resolve) => setImmediate(resolve));
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.finish(null, "SIGTERM");
    await expect(pending).rejects.toThrow(/more than 10 bytes/);
  });

  it("keeps only the tail of a very long stderr", async () => {
    const child = fakeChild();
    const { spawnFn } = spawnReturning(child);
    const pending = runScraper({ spawnFn });
    child.stderr.write("a".repeat(20_000) + "END");
    child.stdout.write(JSON.stringify(RUN));
    child.finish(0);
    const { stderr } = await pending;
    expect(stderr.length).toBeLessThanOrEqual(8192);
    expect(stderr.endsWith("END")).toBe(true);
  });

  it("rejects an invalid timeout", async () => {
    await expect(runScraper({ timeoutMs: 0 })).rejects.toThrow();
  });
});
