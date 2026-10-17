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
    env: { DATABASE_URL: TEST_DB, APP_URL: "http://localhost:3000" },
    // Integration tests share one database, so run files one at a time.
    fileParallelism: false,
    globalSetup: ["tests/global-setup.ts"],
  },
});
