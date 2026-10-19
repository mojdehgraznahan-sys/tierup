import "server-only";
import { db } from "@/server/db";
import { displayName } from "@/lib/names";
import { minuteLabel, minuteOfDay, shortDay } from "@/lib/time";

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
