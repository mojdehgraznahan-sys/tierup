import { defineConfig } from "vitest/config";
import path from "node:path";

const TEST_DB = "postgresql://tierup:tierup@localhost:5433/tierup_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` throws outside React Server Components; tests run services directly.
      "server-only": path.resolve(__dirname, "tests/empty-module.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Tests always run with production rules, whatever local testing switches .env turns on
    // (Prisma loads .env but never overrides variables that are already set).
    env: { DATABASE_URL: TEST_DB, DIRECT_URL: TEST_DB, APP_URL: "http://localhost:3000", RELAX_STAFF_DOMAINS: "false", PARENT_CONSENT: "true" },
    // Integration tests share one database, so run files one at a time.
    fileParallelism: false,
    globalSetup: ["tests/global-setup.ts"],
  },
});
