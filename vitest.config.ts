import path from "node:path";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./src/test/constants.ts";

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
    // Tests share one SQLite file, so run test files one at a time.
    fileParallelism: false,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DEV_MAIL_DIR: path.resolve(import.meta.dirname, ".test-db", "mail"),
    },
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/components/**/*.ts", "worker/**/*.ts"],
      exclude: ["**/*.test.ts", "src/generated/**", "src/test/**"],
    },
  },
});
