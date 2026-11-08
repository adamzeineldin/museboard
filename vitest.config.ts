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
      include: ["src/lib/**/*.ts", "src/components/**/*.ts", "src/app/**/*.ts", "worker/**/*.ts"],
      exclude: ["**/*.test.ts", "src/generated/**", "src/test/**", "**/testing/**", "**/__fixtures__/**"],
    },
  },
});
