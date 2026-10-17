// Local Postgres for development, without Docker or a system install.
// Runs a real Postgres 17 from the embedded-postgres npm package, with data in .data/pg.
// Usage: npm run db:start   (keep it running in its own terminal; Ctrl+C stops it)
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data", "pg");
const PORT = Number(process.env.PGPORT ?? 5433);
const DB_NAME = "tierup";

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "tierup",
    password: "tierup",
    port: PORT,
    persistent: true,
  });

  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log("Initialising database cluster in .data/pg …");
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME]);
  if (!rowCount) await client.query(`CREATE DATABASE ${DB_NAME}`);
  await client.end();

  console.log(`Postgres ready: postgresql://tierup:tierup@localhost:${PORT}/${DB_NAME}`);

  const stop = async () => {
    console.log("\nStopping Postgres …");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
