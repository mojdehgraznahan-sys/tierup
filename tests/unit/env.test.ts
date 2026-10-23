import { describe, expect, it } from "vitest";
import { productionEnvProblems } from "@/server/env";

const good = {
  DATABASE_URL: "postgresql://u:p@pooler.supabase.com:6543/postgres?pgbouncer=true",
  AUTH_SECRET: "x".repeat(44),
  AUTH_GOOGLE_ID: "id",
  AUTH_GOOGLE_SECRET: "secret",
  APP_URL: "https://tierup.app",
  EMAIL_FROM: "TierUp <noreply@tierup.app>",
  CRON_SECRET: "c".repeat(48),
  RESEND_API_KEY: "re_123",
  MEET_PROVIDER: "google",
  GOOGLE_SERVICE_ACCOUNT_KEY: "e30=",
  GOOGLE_MEET_ORGANIZER: "sessions@tierup.app",
};

describe("production env check", () => {
  it("accepts a complete configuration", () => {
    expect(productionEnvProblems(good)).toEqual([]);
  });

  it("flags missing email delivery, http URLs, short secrets and the fake Meet", () => {
    const problems = productionEnvProblems({ ...good, RESEND_API_KEY: "", APP_URL: "http://tierup.app", CRON_SECRET: "short", MEET_PROVIDER: "fake" });
    expect(problems.join("\n")).toMatch(/RESEND_API_KEY is missing/);
    expect(problems.join("\n")).toMatch(/APP_URL must start with https/);
    expect(problems.join("\n")).toMatch(/CRON_SECRET is too short/);
    expect(problems.join("\n")).toMatch(/MEET_PROVIDER must be "google"/);
  });

  it("allows plain http only for localhost", () => {
    expect(productionEnvProblems({ ...good, APP_URL: "http://localhost:3200" })).toEqual([]);
    expect(productionEnvProblems({ ...good, APP_URL: "http://localhost.evil.test" }).join()).toMatch(/https/);
  });

  it("allows explicit preview escapes", () => {
    expect(productionEnvProblems({ ...good, RESEND_API_KEY: "", ALLOW_CONSOLE_EMAIL: "true", MEET_PROVIDER: "fake", ALLOW_FAKE_MEET: "true" })).toEqual([]);
  });
});

describe("testing switches in production", () => {
  it("refuses RELAX_STAFF_DOMAINS", () => {
    expect(productionEnvProblems({ ...good, RELAX_STAFF_DOMAINS: "true" }).join()).toMatch(/RELAX_STAFF_DOMAINS must be off/);
  });

  it("needs an API key for Claude summaries and refuses the fake one", () => {
    expect(productionEnvProblems({ ...good, AI_SUMMARIES: "claude" }).join("\n")).toMatch(/ANTHROPIC_API_KEY is missing/);
    expect(productionEnvProblems({ ...good, AI_SUMMARIES: "claude", ANTHROPIC_API_KEY: "sk-ant-x" })).toEqual([]);
    expect(productionEnvProblems({ ...good, AI_SUMMARIES: "fake" }).join("\n")).toMatch(/AI_SUMMARIES=fake/);
  });

  it("checks the transcript settings", () => {
    expect(productionEnvProblems({ ...good, TRANSCRIPTS: "on" }).join("\n")).toMatch(/TRANSCRIPT_STT=google/);
    expect(productionEnvProblems({ ...good, TRANSCRIPTS: "on", TRANSCRIPT_STT: "google" })).toEqual([]);
    expect(productionEnvProblems({ ...good, MEET_PROVIDER: "fake", ALLOW_FAKE_MEET: "true", GOOGLE_EDUCATION_SCHOOLS: "a.org=b@a.org" }).join("\n")).toMatch(/needs MEET_PROVIDER=google/);
    expect(productionEnvProblems({ ...good, TRANSCRIPT_ARCHIVE: "gs://bucket" }).join("\n")).toMatch(/ARCHIVE_SALT/);
  });
});
