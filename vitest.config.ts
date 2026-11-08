import path from "node:path";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL, TEST_MAIL_DIR } from "./src/test/constants.ts";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "worker/**/*.test.ts", "prisma/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    // Test files in one run share one SQLite file (per run, see src/test/constants.ts), so run them one at a time.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DEV_MAIL_DIR: TEST_MAIL_DIR,
    },
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/components/**/*.ts", "src/app/**/*.ts", "src/mcp/**/*.ts", "src/proxy.ts", "worker/**/*.ts"],
      exclude: ["**/*.test.ts", "src/generated/**", "src/test/**", "**/testing/**", "**/__fixtures__/**"],
      // The consent paths (campaign approval, applications, the Muse connector) must stay well tested.
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
        "src/lib/applications/**/*.ts": { statements: 80, branches: 75, functions: 80, lines: 80 },
        "src/lib/campaign/**/*.ts": { statements: 80, branches: 75, functions: 80, lines: 80 },
        "src/mcp/**/*.ts": { statements: 80, branches: 75, functions: 80, lines: 80 },
        "src/app/(app)/campaign/actions.ts": { statements: 80, branches: 75, functions: 80, lines: 80 },
      },
    },
  },
});
