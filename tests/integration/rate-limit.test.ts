import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { consume } from "@/server/rate-limit";
import { db, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("rate limit", () => {
  it("allows up to the limit per window, then resets", async () => {
    const t0 = new Date("2026-10-20T12:00:00Z");
    const hour = 3600000;
    for (let i = 0; i < 3; i++) expect((await consume("k", 3, hour, t0)).ok).toBe(true);
    const blocked = await consume("k", 3, hour, new Date(t0.getTime() + 10 * 60000));
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(50 * 60000);
    expect((await consume("other", 3, hour, t0)).ok).toBe(true);
    expect((await consume("k", 3, hour, new Date(t0.getTime() + hour + 1))).ok).toBe(true);
  });
});
