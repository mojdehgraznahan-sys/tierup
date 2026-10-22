import "server-only";
import { z } from "zod";
import type { Format, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { sendEmailSafely } from "@/server/email/send";
import { bookingEmail, parentBookingEmail } from "@/server/email/templates";
import { getMeetProvider } from "@/server/integrations/meet";
import { discoverableTutor, discoverableTutorSubject, effectiveFormats } from "@/server/policies/discoverability";
import { hasParentConsent, parentEmailFor } from "@/server/policies/rules";
import { sessionWhen } from "@/server/services/sessions";
import { cellState, SESSION_MINUTES, WEEKS_AHEAD, weekParam, type CellState } from "@/lib/booking";
import { displayName } from "@/lib/names";
import { minuteOfDay, slotInstant, weekStart, WEEKDAYS, zonedDate } from "@/lib/time";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const DAY_MS = 86400000;

/** Clamp a ?week=YYYY-MM-DD param to this week … WEEKS_AHEAD weeks out. */
export function resolveWeek(param: string | undefined, now = new Date()): { week: Date; index: number } {
  const first = weekStart(now);
  const parsed = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? weekStart(new Date(`${param}T12:00:00Z`)) : first;
  const index = Math.min(WEEKS_AHEAD, Math.max(0, Math.round((parsed.getTime() - first.getTime()) / (7 * DAY_MS))));
  return { week: new Date(first.getTime() + index * 7 * DAY_MS), index };
}

async function loadContext(client: Prisma.TransactionClient, learnerId: string, tutorId: string) {
  const learner = await client.user.findUniqueOrThrow({
    where: { id: learnerId },
    include: { school: { include: { slots: { orderBy: { sortOrder: "asc" } } } }, consent: true, availability: { include: { slot: true } } },
  });
  const tutor = await client.user.findFirst({
    where: { id: tutorId, ...discoverableTutor() },
    include: {
      school: { include: { slots: { orderBy: { sortOrder: "asc" } } } },
      tutorStatus: true,
      availability: { include: { slot: true } },
      tutorSubjects: { where: discoverableTutorSubject(), include: { subject: true }, orderBy: { subject: { name: "asc" } } },
    },
  });
  if (!tutor || tutor.id === learnerId || tutor.tutorSubjects.length === 0) return null;

  // Formats both people can use: cross-school → online only; also respect the learner's own choice.
  const learnerFormats: Format[] = learner.formats.length ? learner.formats : ["in_person", "online"];
  const formats = effectiveFormats(tutor, learner.schoolId).filter((f) => learnerFormats.includes(f));
  if (formats.length === 0) return null;

  const key = (weekday: number, minute: number) => `${weekday}-${minute}`;
  const tutorFree = new Set(tutor.availability.map((a) => key(a.weekday, a.slot.startMinute)));
  const learnerFree = new Set(learner.availability.map((a) => key(a.weekday, a.slot.startMinute)));
  const rows = (learner.school ?? tutor.school)?.slots.filter((s) => s.block !== "weekend") ?? [];

  return {
    learner,
    tutor,
    formats,
    rows,
    bothFree: (weekday: number, minute: number) => tutorFree.has(key(weekday, minute)) && learnerFree.has(key(weekday, minute)),
    spaces: formats.includes("in_person") ? (tutor.school?.approvedSpaces ?? []) : [],
  };
}

/** Confirmed sessions for either person around a week, plus the tutor's count within it. */
async function weekLoad(client: Prisma.TransactionClient, week: Date, learnerId: string, tutorId: string) {
  const from = slotInstant(week, 1, 0);
  const to = new Date(slotInstant(week, 1, 0).getTime() + 7 * DAY_MS);
  const sessions = await client.tutoringSession.findMany({
    where: {
      status: "confirmed",
      OR: [{ tutorId }, { learnerId }, { tutorId: learnerId }, { learnerId: tutorId }],
      startsAt: { gte: new Date(from.getTime() - DAY_MS), lt: new Date(to.getTime() + DAY_MS) },
    },
    select: { startsAt: true, durationMin: true, tutorId: true },
  });
  const tutorWeekCount = sessions.filter((s) => s.tutorId === tutorId && s.startsAt >= from && s.startsAt < to).length;
  return { busy: sessions, tutorWeekCount };
}

export type GridCell = { weekday: number; startMinute: number; startsAt: string; state: CellState };

/** Everything the booking page needs for one week. Null if the tutor can't be booked by this learner. */
export async function bookingGrid(learnerId: string, tutorId: string, weekParamRaw?: string, now = new Date()) {
  const ctx = await loadContext(db, learnerId, tutorId);
  if (!ctx) return null;
  const { week, index } = resolveWeek(weekParamRaw, now);
  const { busy, tutorWeekCount } = await weekLoad(db, week, learnerId, tutorId);
  const weeklyCap = ctx.tutor.tutorStatus?.weeklyCap ?? 3;
  const capReached = tutorWeekCount >= weeklyCap;

  const days = WEEKDAYS.map((label, i) => {
    const date = new Date(week.getTime() + i * DAY_MS);
    return { weekday: i + 1, label, date: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) };
  });
  const cells: GridCell[] = ctx.rows.flatMap((row) =>
    days.map((d) => {
      const startsAt = slotInstant(week, d.weekday, row.startMinute);
      return {
        weekday: d.weekday,
        startMinute: row.startMinute,
        startsAt: startsAt.toISOString(),
        state: cellState({ startsAt, bothFree: ctx.bothFree(d.weekday, row.startMinute), now, busy, capReached }),
      };
    }),
  );
  const friday = new Date(week.getTime() + 4 * DAY_MS);
  const md = (d: Date, withMonth: boolean) => d.toLocaleDateString("en-US", { month: withMonth ? "short" : undefined, day: "numeric", timeZone: "UTC" });

  return {
    tutor: { id: ctx.tutor.id, name: displayName(ctx.tutor.name) },
    subjects: ctx.tutor.tutorSubjects.map((ts) => ({ id: ts.subjectId, name: ts.subject.name })),
    formats: ctx.formats,
    spaces: ctx.spaces,
    rows: ctx.rows.map((r) => ({ label: r.label, startMinute: r.startMinute })),
    days,
    cells,
    week: weekParam(week),
    weekLabel: `Week of ${md(week, true)} – ${md(friday, week.getUTCMonth() !== friday.getUTCMonth())}`,
    prevWeek: index > 0 ? weekParam(new Date(week.getTime() - 7 * DAY_MS)) : null,
    nextWeek: index < WEEKS_AHEAD ? weekParam(new Date(week.getTime() + 7 * DAY_MS)) : null,
    capReached,
    weeklyCap,
    consentOk: hasParentConsent(ctx.learner),
    learnerHasAvailability: ctx.learner.availability.length > 0,
  };
}

export const bookingSchema = z.object({
  tutorId: z.string().min(1),
  subjectId: z.string().min(1, "Pick a subject"),
  startsAt: z.string().datetime({ message: "Pick an open time on the grid" }),
  format: z.enum(["in_person", "online"]),
  location: z.string().trim().max(100).optional(),
  threadId: z.string().optional(),
  requestId: z.string().optional(),
});

/**
 * Books a session. Every rule is re-checked here, under per-person advisory locks so two
 * concurrent bookings can't both take the last slot or the tutor's last weekly spot.
 * Online sessions get their own one-time Meet; if that fails, the booking is rolled back.
 */
export async function createBooking(learnerId: string, raw: z.input<typeof bookingSchema>, now = new Date()) {
  const input = bookingSchema.parse(raw);
  const startsAt = new Date(input.startsAt);

  const session = await db.$transaction(async (tx) => {
    for (const id of [learnerId, input.tutorId].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    }

    const ctx = await loadContext(tx, learnerId, input.tutorId);
    if (!ctx) throw new UserError("This tutor isn't available for booking.");
    if (!ctx.learner.roles.includes("learner")) throw new UserError("Only learners can book sessions.");
    if (!hasParentConsent(ctx.learner)) throw new UserError("You can book once your parent approves TierUp.");

    const subject = ctx.tutor.tutorSubjects.find((ts) => ts.subjectId === input.subjectId);
    if (!subject) throw new UserError("This tutor isn't approved for that subject.");

    // Format and place (BACKEND.md › Cross-school / In person).
    if (!ctx.formats.includes(input.format)) {
      throw new UserError(input.format === "in_person" ? "In-person sessions need you both at the same school." : "Online isn't available with this tutor.");
    }
    let location: string | null = null;
    if (input.format === "in_person") {
      if (!input.location || !ctx.spaces.includes(input.location)) throw new UserError("Pick one of your school's approved spaces.");
      location = input.location;
    }

    // The time must be a real slot on the grid, open for both, within the booking window.
    const week = weekStart(startsAt);
    const weeksOut = Math.round((week.getTime() - weekStart(now).getTime()) / (7 * DAY_MS));
    if (weeksOut < 0 || weeksOut > WEEKS_AHEAD) throw new UserError("Pick a time within the next few weeks.");
    const { weekday } = zonedDate(startsAt);
    const minute = minuteOfDay(startsAt);
    const row = ctx.rows.find((r) => r.startMinute === minute);
    if (!row || weekday < 1 || weekday > 5 || slotInstant(week, weekday, minute).getTime() !== startsAt.getTime()) {
      throw new UserError("Pick an open time on the grid.");
    }
    const { busy, tutorWeekCount } = await weekLoad(tx, week, learnerId, input.tutorId);
    const weeklyCap = ctx.tutor.tutorStatus?.weeklyCap ?? 3;
    const state = cellState({ startsAt, bothFree: ctx.bothFree(weekday, minute), now, busy, capReached: tutorWeekCount >= weeklyCap });
    if (state !== "open") {
      const why: Record<Exclude<CellState, "open">, string> = {
        none: "You're not both free at that time.",
        past: "That time is too soon. Pick a later slot.",
        busy: "That time was just taken. Pick another slot.",
        full: `${displayName(ctx.tutor.name)} is fully booked that week (max ${weeklyCap} sessions).`,
      };
      throw new UserError(why[state]);
    }

    // Keep the chat history: book from the pre-booking thread when there is one (BACKEND.md › Thread → Session).
    let thread = input.threadId
      ? await tx.thread.findFirst({ where: { id: input.threadId, learnerId, tutorId: input.tutorId, session: { is: null } } })
      : null;
    thread ??= await tx.thread.findFirst({
      where: { learnerId, tutorId: input.tutorId, subjectId: input.subjectId, session: { is: null } },
      orderBy: { lastMessageAt: "desc" },
    });
    if (thread && thread.subjectId !== input.subjectId) {
      thread = await tx.thread.update({ where: { id: thread.id }, data: { subjectId: input.subjectId } });
    }
    thread ??= await tx.thread.create({ data: { learnerId, tutorId: input.tutorId, subjectId: input.subjectId } });

    const request = input.requestId
      ? await tx.helpRequest.findFirst({ where: { id: input.requestId, learnerId, status: "open", subjectId: input.subjectId } })
      : null;
    if (request) await tx.helpRequest.update({ where: { id: request.id }, data: { status: "matched" } });

    return tx.tutoringSession.create({
      data: {
        threadId: thread.id,
        learnerId,
        tutorId: input.tutorId,
        subjectId: input.subjectId,
        requestId: request?.id,
        source: request ? "request" : "direct",
        startsAt,
        durationMin: SESSION_MINUTES,
        format: input.format,
        location,
        status: "confirmed",
      },
      include: {
        subject: true,
        learner: { include: { consent: true, school: { include: { slots: true } } } },
        tutor: true,
      },
    });
  });

  // One-time Meet for online sessions. On failure, undo the booking so nobody holds a session without a link.
  let meetUrl: string | null = null;
  if (session.format === "online") {
    try {
      const provider = await getMeetProvider();
      const meeting = await provider.createMeeting({
        sessionId: session.id,
        summary: `TierUp: ${session.subject.name} with ${displayName(session.tutor.name)}`,
        description: "One-time TierUp tutoring session. This Meet link only works for this session and expires when it ends.",
        startsAt: session.startsAt,
        durationMin: session.durationMin,
        attendees: [
          { email: session.learner.email, name: displayName(session.learner.name) },
          { email: session.tutor.email, name: displayName(session.tutor.name) },
        ],
      });
      meetUrl = meeting.meetUrl;
      await db.tutoringSession.update({
        where: { id: session.id },
        data: { meetUrl: meeting.meetUrl, calendarEventId: meeting.calendarEventId, meetSpaceName: meeting.spaceName },
      });
    } catch (err) {
      console.error("Meet creation failed; rolling back booking", err);
      await db.$transaction([
        db.tutoringSession.delete({ where: { id: session.id } }),
        ...(session.requestId ? [db.helpRequest.update({ where: { id: session.requestId }, data: { status: "open" } })] : []),
      ]);
      throw new UserError("We couldn't create the Google Meet for this session. Please try again.");
    }
  }

  // Notifications (after the booking is final).
  const labels = new Map((session.learner.school?.slots ?? []).map((s) => [s.startMinute, s.label]));
  const when = sessionWhen(session.startsAt, labels);
  const where = session.format === "online" ? "Google Meet" : (session.location ?? "School");
  const url = `${appUrl()}/sessions/${session.threadId}`;
  const tutorName = displayName(session.tutor.name);
  const learnerName = displayName(session.learner.name);
  await sendEmailSafely(bookingEmail({ to: session.learner.email, otherName: tutorName, subject: session.subject.name, when, where, meetUrl, url }));
  await sendEmailSafely(bookingEmail({ to: session.tutor.email, otherName: learnerName, subject: session.subject.name, when, where, meetUrl, url }));
  const parentTo = parentEmailFor(session.learner.consent);
  if (parentTo) {
    await sendEmailSafely(
      parentBookingEmail({ to: parentTo, studentName: learnerName, tutorName, subject: session.subject.name, when, where }),
    );
  }

  return { sessionId: session.id, threadId: session.threadId };
}

/** The confirmation screen for a participant. */
export async function bookedView(userId: string, sessionId: string) {
  const s = await db.tutoringSession.findFirst({
    where: { id: sessionId, OR: [{ learnerId: userId }, { tutorId: userId }] },
    include: { subject: true, tutor: true, learner: { include: { school: { include: { slots: true } } } } },
  });
  if (!s) return null;
  const labels = new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label]));
  const asLearner = s.learnerId === userId;
  return {
    id: s.id,
    threadId: s.threadId,
    otherName: displayName(asLearner ? s.tutor.name : s.learner.name),
    subjectName: s.subject.name,
    when: sessionWhen(s.startsAt, labels),
    durationMin: s.durationMin,
    format: s.format,
    location: s.location,
    meetUrl: s.meetUrl,
    status: s.status,
  };
}
