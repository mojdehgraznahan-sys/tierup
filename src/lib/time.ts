// School-local time helpers. Every launch school is in the DMV, so all slot times are
// America/New_York; we store UTC instants and convert at the edges.

export const SCHOOL_TZ = "America/New_York";
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

/** Offset of `tz` from UTC at the given instant, in minutes (e.g. -240 for EDT). */
function tzOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** The UTC instant for a wall-clock time in `tz`. `month` is 1-based. */
export function zonedToUtc(year: number, month: number, day: number, minuteOfDay: number, tz = SCHOOL_TZ): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, minuteOfDay));
  const offset = tzOffsetMinutes(guess, tz);
  const result = new Date(guess.getTime() - offset * 60000);
  // Re-check once in case the guess and the result straddle a DST change.
  const offset2 = tzOffsetMinutes(result, tz);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60000);
}

/** Calendar date (y, m, d) of an instant in `tz`. */
export function zonedDate(instant: Date, tz = SCHOOL_TZ): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), weekday };
}

/** Monday (school-local calendar date) of the week containing `instant`, as a UTC-midnight Date used as a date key. */
export function weekStart(instant: Date, tz = SCHOOL_TZ): Date {
  const { year, month, day, weekday } = zonedDate(instant, tz);
  const back = (weekday + 6) % 7; // Mon → 0 … Sun → 6
  return new Date(Date.UTC(year, month - 1, day - back));
}

/** Start instant of a slot: `week` is a weekStart() key, `weekday` 1 = Mon … 5 = Fri. */
export function slotInstant(week: Date, weekday: number, startMinute: number, tz = SCHOOL_TZ): Date {
  const d = new Date(week.getTime() + (weekday - 1) * 86400000);
  return zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), startMinute, tz);
}

/** "3:30 pm" style label for a minute-of-day. */
export function minuteLabel(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Thursday, Oct 15" (school-local). */
export function longDate(instant: Date, tz = SCHOOL_TZ): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" }).format(instant);
}

/** "Tue Oct 20" (school-local). */
export function shortDay(instant: Date, tz = SCHOOL_TZ): string {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(instant);
  return s.replace(",", "");
}

/** Minutes after midnight of an instant, school-local. */
export function minuteOfDay(instant: Date, tz = SCHOOL_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return get("hour") * 60 + get("minute");
}
