// Production configuration check, run once at server start (src/instrumentation.ts).
// Fails fast with a readable list instead of breaking later for a real user.

type Env = Record<string, string | undefined>;

export function productionEnvProblems(env: Env = process.env): string[] {
  const problems: string[] = [];
  const need = (key: string, why: string) => {
    if (!env[key]?.trim()) problems.push(`${key} is missing (${why})`);
  };

  need("DATABASE_URL", "database");
  need("AUTH_SECRET", "signs login sessions; generate with `npx auth secret`");
  need("AUTH_GOOGLE_ID", "Google sign-in");
  need("AUTH_GOOGLE_SECRET", "Google sign-in");
  need("APP_URL", "links in emails, e.g. https://tierup.app");
  need("EMAIL_FROM", "sender for all emails");
  need("CRON_SECRET", "protects /api/cron");

  // https everywhere except a local production build (e.g. end-to-end tests on localhost).
  if (env.APP_URL && !env.APP_URL.startsWith("https://") && !/^http:\/\/localhost(:\d+)?(\/|$)/.test(env.APP_URL)) {
    problems.push("APP_URL must start with https:// in production");
  }
  if (env.AUTH_SECRET && env.AUTH_SECRET.length < 32) problems.push("AUTH_SECRET is too short (use 32+ random characters)");
  if (env.CRON_SECRET && env.CRON_SECRET.length < 32) problems.push("CRON_SECRET is too short (use `openssl rand -hex 24`)");

  // Without Resend, emails (including sign-in links) would only be printed to the server log.
  if (!env.RESEND_API_KEY && env.ALLOW_CONSOLE_EMAIL !== "true") problems.push("RESEND_API_KEY is missing (email delivery)");

  if (env.MEET_PROVIDER === "google") {
    need("GOOGLE_MEET_ORGANIZER", "MEET_PROVIDER=google");
    if (!env.GOOGLE_MEET_SERVICE_ACCOUNT && !env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      problems.push("MEET_PROVIDER=google needs GOOGLE_MEET_SERVICE_ACCOUNT (keyless, Cloud Run) or GOOGLE_SERVICE_ACCOUNT_KEY");
    }
  } else if (env.ALLOW_FAKE_MEET !== "true") {
    problems.push('MEET_PROVIDER must be "google" in production (or set ALLOW_FAKE_MEET=true for a preview without real Meet links)');
  }
  return problems;
}

export function assertProductionEnv(env: Env = process.env) {
  const problems = productionEnvProblems(env);
  if (problems.length) {
    throw new Error(`TierUp can't start: fix these environment variables first.\n  - ${problems.join("\n  - ")}`);
  }
}
