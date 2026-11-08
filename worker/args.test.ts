import { describe, expect, it } from "vitest";
import { parseWorkerArgs } from "./args";

describe("parseWorkerArgs", () => {
  it("defaults to the schedule with an initial run", () => {
    expect(parseWorkerArgs([])).toEqual({ mode: "schedule", initialRun: true });
  });

  it("supports --no-initial", () => {
    expect(parseWorkerArgs(["--no-initial"])).toEqual({ mode: "schedule", initialRun: false });
  });

  it("supports --once", () => {
    expect(parseWorkerArgs(["--once"])).toEqual({ mode: "once", initialRun: true });
  });

  it("rejects unknown flags", () => {
    expect(() => parseWorkerArgs(["--nope"])).toThrow(/unknown argument "--nope"/);
  });

  it("rejects --once together with --no-initial", () => {
    expect(() => parseWorkerArgs(["--once", "--no-initial"])).toThrow(/cannot be combined/);
  });
});
