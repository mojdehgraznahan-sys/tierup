import "server-only";
import { db } from "@/server/db";
import { displayName } from "@/lib/names";
import { minuteLabel, minuteOfDay, shortDay, slotInstant, weekStart } from "@/lib/time";

/** "Tue Oct 20 · 3:30 pm" (uses the school's slot label, e.g. "Lunch", when the time matches one). */
export function sessionWhen(startsAt: Date, slotLabels: Map<number, string>): string {
  const minute = minuteOfDay(startsAt);
  return `${shortDay(startsAt)} · ${slotLabels.get(minute) ?? minuteLabel(minute)}`;
}

/** Learner's confirmed sessions that haven't ended yet, soonest first (pre-booking chats excluded). */
export async function upcomingForLearner(learnerId: string) {
  const now = Date.now();
  const sessions = await db.tutoringSession.findMany({
    where: { learnerId, status: "confirmed", startsAt: { gte: new Date(now - 3 * 3600000) } },
    include: { tutor: { select: { name: true } }, subject: true, learner: { select: { school: { include: { slots: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  return sessions
    .filter((s) => s.startsAt.getTime() + s.durationMin * 60000 > now)
    .map((s) => {
      const labels = new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label]));
      return {
        id: s.id,
        threadId: s.threadId,
        subjectName: s.subject.name,
        tutorName: displayName(s.tutor.name),
        when: sessionWhen(s.startsAt, labels),
        startsAt: s.startsAt,
        durationMin: s.durationMin,
        format: s.format,
        where: s.format === "online" ? "Google Meet" : (s.location ?? "School"),
        meetUrl: s.meetUrl,
      };
    });
}

/** Learner's sessions that have ended but haven't been marked complete yet ("How did it go?"). */
export async function awaitingReview(learnerId: string, now = new Date()) {
  const sessions = await db.tutoringSession.findMany({
    where: { learnerId, status: "confirmed", startsAt: { lt: now }, review: { is: null } },
    include: { tutor: { select: { name: true } }, subject: true, learner: { select: { school: { include: { slots: true } } } } },
    orderBy: { startsAt: "desc" },
    take: 5,
  });
  return sessions
    .filter((s) => s.startsAt.getTime() + s.durationMin * 60000 <= now.getTime())
    .map((s) => ({
      id: s.id,
      threadId: s.threadId,
      subjectName: s.subject.name,
      tutorName: displayName(s.tutor.name),
      when: sessionWhen(s.startsAt, new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label]))),
    }));
}

/** Days a finished session keeps asking the tutor to wrap it up. */
const TUTOR_WRAP_UP_DAYS = 14;

/** Tutor's recent sessions that have ended without the tutor's wrap-up ("How did it go?"). */
export async function awaitingTutorWrapUp(tutorId: string, now = new Date()) {
  const sessions = await db.tutoringSession.findMany({
    where: {
      tutorId,
      status: { in: ["confirmed", "completed"] },
      tutorWrappedUpAt: null,
      startsAt: { lt: now, gte: new Date(now.getTime() - TUTOR_WRAP_UP_DAYS * 86400000) },
    },
    include: { learner: { select: { name: true, school: { include: { slots: true } } } }, subject: true },
    orderBy: { startsAt: "desc" },
    take: 5,
  });
  return sessions
    .filter((s) => s.startsAt.getTime() + s.durationMin * 60000 <= now.getTime())
    .map((s) => ({
      id: s.id,
      threadId: s.threadId,
      subjectName: s.subject.name,
      learnerName: displayName(s.learner.name),
      when: sessionWhen(s.startsAt, new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label]))),
    }));
}

/** Tutor's confirmed sessions that haven't ended, soonest first. */
export async function upcomingForTutor(tutorId: string, now = new Date()) {
  const sessions = await db.tutoringSession.findMany({
    where: { tutorId, status: "confirmed", startsAt: { gte: new Date(now.getTime() - 3 * 3600000) } },
    include: { learner: { select: { name: true, school: { include: { slots: true } } } }, subject: true },
    orderBy: { startsAt: "asc" },
  });
  return sessions
    .filter((s) => s.startsAt.getTime() + s.durationMin * 60000 > now.getTime())
    .map((s) => ({
      id: s.id,
      threadId: s.threadId,
      subjectName: s.subject.name,
      learnerName: displayName(s.learner.name),
      when: sessionWhen(s.startsAt, new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label]))),
      startsAt: s.startsAt,
      durationMin: s.durationMin,
      format: s.format,
      where: s.format === "online" ? "Google Meet" : (s.location ?? "School"),
      meetUrl: s.meetUrl,
    }));
}

/** Tutor's confirmed sessions in the current school week (for the weekly cap display). */
export async function tutorWeekCount(tutorId: string, now = new Date()) {
  const week = weekStart(now);
  const from = slotInstant(week, 1, 0);
  const to = new Date(from.getTime() + 7 * 86400000);
  return db.tutoringSession.count({ where: { tutorId, status: "confirmed", startsAt: { gte: from, lt: to } } });
}
