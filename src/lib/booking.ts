import { conflicts, type Busy } from "./slots";

export const SESSION_MINUTES = 45;
/** Bookings must start at least this far ahead. */
export const LEAD_MINUTES = 60;
/** This week plus three more. */
export const WEEKS_AHEAD = 3;

export type CellState = "open" | "none" | "past" | "busy" | "full";

/**
 * One cell of the booking grid (BACKEND.md › Booking slots): open only where both people are
 * free, it's far enough ahead, neither has a clashing session, and the tutor's week isn't full.
 */
export function cellState(opts: {
  startsAt: Date;
  bothFree: boolean;
  now: Date;
  busy: Busy[];
  capReached: boolean;
  durationMin?: number;
}): CellState {
  if (!opts.bothFree) return "none";
  if (opts.startsAt.getTime() < opts.now.getTime() + LEAD_MINUTES * 60000) return "past";
  if (conflicts(opts.startsAt, opts.durationMin ?? SESSION_MINUTES, opts.busy)) return "busy";
  if (opts.capReached) return "full";
  return "open";
}

/** "2026-10-19" for a weekStart() key. */
export const weekParam = (week: Date) => week.toISOString().slice(0, 10);
