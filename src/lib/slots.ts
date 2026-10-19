import { minuteLabel, shortDay, slotInstant, weekStart } from "./time";

// Pure helpers for weekly availability. Slots from different schools are compared by
// (weekday, startMinute), since each school has its own SchoolSlot rows.

export type WeeklySlot = { weekday: number; startMinute: number; label?: string };
export type Busy = { startsAt: Date; durationMin: number };

export const slotKey = (s: WeeklySlot) => `${s.weekday}-${s.startMinute}`;

/** Weekly slots both people are free in. */
export function overlap(a: WeeklySlot[], b: WeeklySlot[]): WeeklySlot[] {
  const keys = new Set(b.map(slotKey));
  return a.filter((s) => keys.has(slotKey(s)));
}

/** True if a session starting at `start` for `durationMin` collides with any busy interval. */
export function conflicts(start: Date, durationMin: number, busy: Busy[]): boolean {
  const s = start.getTime();
  const e = s + durationMin * 60000;
  return busy.some((b) => {
    const bs = b.startsAt.getTime();
    return s < bs + b.durationMin * 60000 && bs < e;
  });
}

/**
 * Concrete upcoming instants for a weekly pattern, soonest first, skipping anything that starts
 * within `leadMinutes` of now or conflicts with `busy`.
 */
export function upcomingSlots(
  weekly: WeeklySlot[],
  opts: { now: Date; weeks?: number; busy?: Busy[]; durationMin?: number; leadMinutes?: number },
): { startsAt: Date; slot: WeeklySlot }[] {
  const { now, weeks = 2, busy = [], durationMin = 45, leadMinutes = 60 } = opts;
  const earliest = now.getTime() + leadMinutes * 60000;
  const first = weekStart(now);
  const out: { startsAt: Date; slot: WeeklySlot }[] = [];
  for (let w = 0; w < weeks; w++) {
    const week = new Date(first.getTime() + w * 7 * 86400000);
    for (const slot of weekly) {
      const startsAt = slotInstant(week, slot.weekday, slot.startMinute);
      if (startsAt.getTime() < earliest) continue;
      if (conflicts(startsAt, durationMin, busy)) continue;
      out.push({ startsAt, slot });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** "Mon Oct 19 · 3:30 pm" (uses the slot label, e.g. "Lunch", when given). */
export function slotText(startsAt: Date, slot: WeeklySlot): string {
  return `${shortDay(startsAt)} · ${slot.label ?? minuteLabel(slot.startMinute)}`;
}
