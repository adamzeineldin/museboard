import { spawn, type SpawnOptions } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Runs `python3 -m scraper --companies scraper/companies.json --out -` from the repo root and parses stdout.
// The scraper must run with cwd = repo root: never put scraper/ itself on sys.path (its http.py shadows stdlib http).
// Exit codes: 0 = at least one company ok, 1 = every company failed (JSON still written), 2 = usage/config error.

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // a full run takes ~1 min; the scraper agent asks for >= 5 min
const DEFAULT_KILL_GRACE_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const STDERR_TAIL_CHARS = 8192;
const ACCEPTED_EXIT_CODES = new Set([0, 1]);

/** The subset of ChildProcess that runScraper uses (lets tests pass a fake). */
export interface ChildLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}

export type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildLike;

const optionsSchema = z.strictObject({
  cwd: z.string().min(1).optional(),
  python: z.string().min(1).optional(),
  companiesPath: z.string().min(1).optional(),
  extraArgs: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  killGraceMs: z.number().int().nonnegative().optional(),
  maxOutputBytes: z.number().int().positive().optional(),
  spawnFn: z.custom<SpawnFn>((value) => typeof value === "function").optional(),
});

export type RunScraperOptions = z.input<typeof optionsSchema>;

export interface ScraperResult {
  /** Parsed stdout. Still untrusted: validate it with ingestRun. */
  json: unknown;
  exitCode: number;
  /** Last few KB of stderr (scraper logs). */
  stderr: string;
}

export class ScraperError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
    readonly exitCode: number | null = null,
  ) {
    super(stderr.trim() === "" ? message : `${message}\n--- scraper stderr (tail) ---\n${stderr.trim()}`);
    this.name = "ScraperError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function appendTail(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length > STDERR_TAIL_CHARS ? next.slice(next.length - STDERR_TAIL_CHARS) : next;
}

export function runScraper(options: RunScraperOptions = {}): Promise<ScraperResult> {
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) return Promise.reject(new Error(`invalid runScraper options: ${parsed.error.message}`));
  const opts = parsed.data;
  const python = opts.python ?? process.env.INROAD_PYTHON ?? "python3";
  const args = ["-m", "scraper", "--companies", opts.companiesPath ?? "scraper/companies.json", "--out", "-", ...(opts.extraArgs ?? [])];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const killGraceMs = opts.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const spawnFn: SpawnFn = opts.spawnFn ?? ((cmd, argv, spawnOptions) => spawn(cmd, [...argv], spawnOptions));

  return new Promise<ScraperResult>((resolve, reject) => {
    let child: ChildLike;
    try {
      child = spawnFn(python, args, { cwd: opts.cwd ?? REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], env: process.env });
    } catch (error) {
      reject(new ScraperError(`could not start ${python}: ${errorMessage(error)}`, ""));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = "";
    let failure: string | null = null;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const terminate = (reason: string): void => {
      if (failure !== null) return;
      failure = reason;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
    };
    const timeoutTimer = setTimeout(() => terminate(`scraper timed out after ${Math.round(timeoutMs / 1000)}s`), timeoutMs);
    const finish = (outcome: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      outcome();
    };

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      stdoutBytes += buffer.length;
      if (stdoutBytes > maxOutputBytes) {
        terminate(`scraper wrote more than ${maxOutputBytes} bytes to stdout`);
        return;
      }
      stdoutChunks.push(buffer);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr = appendTail(stderr, chunk.toString());
    });

    child.on("error", (error) => {
      finish(() => reject(new ScraperError(`could not start ${python}: ${error.message}`, stderr)));
    });

    child.on("close", (code, signal) => {
      finish(() => {
        if (failure !== null) return reject(new ScraperError(failure, stderr, code));
        if (code === null || !ACCEPTED_EXIT_CODES.has(code)) {
          const how = code === null ? `was killed by ${signal ?? "a signal"}` : `exited with code ${code}`;
          return reject(new ScraperError(`scraper ${how}`, stderr, code));
        }
        try {
          resolve({ json: JSON.parse(Buffer.concat(stdoutChunks).toString("utf8")), exitCode: code, stderr });
        } catch (error) {
          reject(new ScraperError(`scraper stdout is not valid JSON (${errorMessage(error)})`, stderr, code));
        }
      });
    });
  });
}
