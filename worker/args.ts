// CLI flags for worker/index.ts.
//   (none)         run once now, then every 6 hours
//   --no-initial   skip the startup run, wait for the first cron tick
//   --once         run a single pass and exit (npm run scrape:once)

export interface WorkerArgs {
  mode: "schedule" | "once";
  initialRun: boolean;
}

const KNOWN_FLAGS = new Set(["--once", "--no-initial"]);

export function parseWorkerArgs(argv: readonly string[]): WorkerArgs {
  const unknown = argv.find((arg) => !KNOWN_FLAGS.has(arg));
  if (unknown !== undefined) {
    throw new Error(`unknown argument "${unknown}" (expected --once or --no-initial)`);
  }
  const once = argv.includes("--once");
  const noInitial = argv.includes("--no-initial");
  if (once && noInitial) throw new Error("--once and --no-initial cannot be combined");
  return { mode: once ? "once" : "schedule", initialRun: !noInitial };
}
