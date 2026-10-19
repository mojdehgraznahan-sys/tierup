import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
import { rankScore } from "@/server/services/discovery";

describe("rating rank", () => {
  it("prefers a well-reviewed 4.9 over a 5.0 from two reviews", () => {
    expect(rankScore({ avg: 4.9, count: 12 })).toBeGreaterThan(rankScore({ avg: 5, count: 2 }));
  });

  it("places new tutors between well-rated and poorly-rated ones", () => {
    expect(rankScore(null)).toBeLessThan(rankScore({ avg: 4.9, count: 12 }));
    expect(rankScore(null)).toBeGreaterThan(rankScore({ avg: 3, count: 4 }));
  });
});
