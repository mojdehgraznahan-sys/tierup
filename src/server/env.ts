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

  if (env.RELAX_STAFF_DOMAINS === "true") problems.push("RELAX_STAFF_DOMAINS must be off in production (anyone could sign up as staff)");

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
  // AI session summaries are optional; when on, they need a key, and the fake is for previews only.
  if (env.AI_SUMMARIES === "claude") need("ANTHROPIC_API_KEY", "AI_SUMMARIES=claude");
  if (env.AI_SUMMARIES === "fake") problems.push('AI_SUMMARIES=fake writes placeholder summaries; use "claude" or leave it unset in production');
  // Session transcripts: real speech-to-text, Google schools on the real Meet, archive pseudonyms salted.
  if (env.TRANSCRIPTS === "on" && env.TRANSCRIPT_STT !== "google") problems.push('TRANSCRIPTS=on needs TRANSCRIPT_STT=google (Google Cloud Speech-to-Text)');
  if (env.GOOGLE_EDUCATION_SCHOOLS && env.MEET_PROVIDER !== "google") problems.push("GOOGLE_EDUCATION_SCHOOLS needs MEET_PROVIDER=google");
  if (env.TRANSCRIPT_ARCHIVE && (env.ARCHIVE_SALT ?? "").length < 32) problems.push("TRANSCRIPT_ARCHIVE needs ARCHIVE_SALT (32+ random characters; keep it secret and never change it)");
  return problems;
}

export function assertProductionEnv(env: Env = process.env) {
  const problems = productionEnvProblems(env);
  if (problems.length) {
    throw new Error(`TierUp can't start: fix these environment variables first.\n  - ${problems.join("\n  - ")}`);
  }
}
