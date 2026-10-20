// Vercel build step: apply database migrations, but only for production deploys.
// Preview deploys must not migrate the production database.
import { execSync } from "node:child_process";

if (process.env.VERCEL_ENV === "production") {
  console.log("Applying database migrations (production deploy)…");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(`Skipping migrations for VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}.`);
}
