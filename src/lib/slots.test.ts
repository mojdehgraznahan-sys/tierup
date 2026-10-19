import { describe, expect, it } from "vitest";
import { conflicts, overlap, slotText, upcomingSlots } from "./slots";

describe("weekly slots", () => {
  it("overlaps by weekday and start time", () => {
    const a = [{ weekday: 1, startMinute: 930 }, { weekday: 2, startMinute: 730 }];
    const b = [{ weekday: 2, startMinute: 730 }, { weekday: 3, startMinute: 930 }];
    expect(overlap(a, b)).toEqual([{ weekday: 2, startMinute: 730 }]);
  });

  it("detects conflicts with existing sessions", () => {
    const busy = [{ startsAt: new Date("2026-10-20T19:30:00Z"), durationMin: 45 }];
    expect(conflicts(new Date("2026-10-20T20:00:00Z"), 45, busy)).toBe(true);
    expect(conflicts(new Date("2026-10-20T20:15:00Z"), 45, busy)).toBe(false);
  });

  it("lists upcoming instants soonest first, skipping past, near and busy slots", () => {
    // Friday Oct 16 2026, 10:00 Eastern.
    const now = new Date("2026-10-16T14:00:00Z");
    const weekly = [
      { weekday: 5, startMinute: 630, label: "Late morning" }, // Fri 10:30 today: inside the 60-min lead → skipped
      { weekday: 5, startMinute: 930, label: "3:30 pm" }, // Fri 3:30 today
      { weekday: 1, startMinute: 930, label: "3:30 pm" }, // Mon next week
    ];
    const busy = [{ startsAt: new Date("2026-10-16T19:30:00Z"), durationMin: 45 }]; // Fri 3:30 taken
    const slots = upcomingSlots(weekly, { now, busy });
    expect(slotText(slots[0]!.startsAt, slots[0]!.slot)).toBe("Mon Oct 19 · 3:30 pm");
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-10-19T19:30:00.000Z",
      "2026-10-23T14:30:00.000Z",
      "2026-10-23T19:30:00.000Z",
    ]);
  });
});
