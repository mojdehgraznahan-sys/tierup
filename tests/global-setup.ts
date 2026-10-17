// Creates and migrates the `tierup_test` database before the test run.
// Requires the local Postgres from `npm run db:start`.
import { execSync } from "node:child_process";
import pg from "pg";

const ADMIN_URL = "postgresql://tierup:tierup@localhost:5433/postgres";
const TEST_URL = "postgresql://tierup:tierup@localhost:5433/tierup_test";

export default async function setup() {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await client.connect();
  } catch {
    throw new Error("Postgres isn't running on :5433. Start it with `npm run db:start`.");
  }
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = 'tierup_test'");
  if (!rowCount) await client.query("CREATE DATABASE tierup_test");
  await client.end();
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_URL }, stdio: "pipe" });
}
