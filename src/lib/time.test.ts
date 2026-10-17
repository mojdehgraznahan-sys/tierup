import { describe, expect, it } from "vitest";
import { minuteLabel, shortDay, slotInstant, weekStart, zonedToUtc } from "./time";

describe("school-local time", () => {
  it("converts Eastern wall-clock time to UTC across DST", () => {
    expect(zonedToUtc(2026, 10, 20, 15 * 60 + 30).toISOString()).toBe("2026-10-20T19:30:00.000Z"); // EDT
    expect(zonedToUtc(2026, 12, 1, 15 * 60 + 30).toISOString()).toBe("2026-12-01T20:30:00.000Z"); // EST
  });

  it("finds the Monday of the school week", () => {
    // Friday Oct 16 2026, 11pm Eastern = Saturday 03:00 UTC: still the week of Oct 12.
    expect(weekStart(new Date("2026-10-17T03:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-12");
    expect(weekStart(new Date("2026-10-19T14:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-19");
  });

  it("builds slot instants and labels", () => {
    const week = new Date(Date.UTC(2026, 9, 19));
    const tueLunch = slotInstant(week, 2, 12 * 60 + 10);
    expect(tueLunch.toISOString()).toBe("2026-10-20T16:10:00.000Z");
    expect(shortDay(tueLunch)).toBe("Tue Oct 20");
    expect(minuteLabel(19 * 60)).toBe("7:00 pm");
    expect(minuteLabel(12 * 60 + 10)).toBe("12:10 pm");
  });
});
