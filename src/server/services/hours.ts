import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { sessionWhen } from "@/server/services/sessions";
import { displayName } from "@/lib/names";
import { shortDay, zonedDate } from "@/lib/time";

/** US school year: Aug 1 – Jul 31 (school-local). */
export function schoolYear(now = new Date()) {
  const { year, month } = zonedDate(now);
  const startYear = month >= 8 ? year : year - 1;
  return {
    start: new Date(Date.UTC(startYear, 7, 1, 4)), // Aug 1, 00:00 Eastern (EDT)
    end: new Date(Date.UTC(startYear + 1, 7, 1, 4)),
    label: `${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`,
  };
}

/** hours = durationMin / 60 (BACKEND.md › Hours). */
export const hoursFor = (durationMin: number) => Math.round((durationMin / 60) * 100) / 100;

/** Sessions a tutor can log: completed, or confirmed and already over. Never no-shows or cancellations. */
function loggable(now: Date): Prisma.TutoringSessionWhereInput {
  return {
    OR: [{ status: "completed" }, { status: "confirmed", startsAt: { lt: now } }],
  };
}

const sum = (rows: { hours: Prisma.Decimal }[]) => Math.round(rows.reduce((a, r) => a + Number(r.hours), 0) * 100) / 100;

export type CompletedRow = {
  sessionId: string;
  subjectName: string;
  learnerName: string;
  dateText: string;
  durationMin: number;
  hours: number;
  status: "unlogged" | "logged" | "approved" | "rejected";
  learnerConfirmed: boolean;
};

/** The dashboard's Service hours card: approved total, pending, goal and the completed-sessions list. */
export async function tutorHours(tutorId: string, now = new Date()) {
  const year = schoolYear(now);
  const tutor = await db.user.findUniqueOrThrow({ where: { id: tutorId }, include: { school: true } });
  const sessions = await db.tutoringSession.findMany({
    where: { tutorId, startsAt: { gte: year.start, lt: year.end }, ...loggable(now) },
    include: { learner: { select: { name: true } }, subject: true, hourLog: true },
    orderBy: { startsAt: "desc" },
  });
  // A session counts as over only after its end time.
  const over = sessions.filter((s) => s.status === "completed" || s.startsAt.getTime() + s.durationMin * 60000 <= now.getTime());

  const logs = over.map((s) => s.hourLog).filter((l): l is NonNullable<typeof l> => !!l);
  const rows: CompletedRow[] = over.map((s) => ({
    sessionId: s.id,
    subjectName: s.subject.name,
    learnerName: displayName(s.learner.name),
    dateText: `${shortDay(s.startsAt)} · ${s.durationMin} min`,
    durationMin: s.durationMin,
    hours: hoursFor(s.durationMin),
    status: s.hourLog ? s.hourLog.status : "unlogged",
    learnerConfirmed: !!s.learnerConfirmedAt,
  }));

  return {
    yearLabel: year.label,
    approved: sum(logs.filter((l) => l.status === "approved")),
    pending: sum(logs.filter((l) => l.status === "logged")),
    goal: tutor.school?.serviceHourGoal ?? 40,
    rows,
  };
}

async function ownLoggableSession(tutorId: string, sessionId: string, now: Date) {
  const s = await db.tutoringSession.findFirst({
    where: { id: sessionId, tutorId, ...loggable(now) },
    include: { hourLog: true },
  });
  if (!s || (s.status === "confirmed" && s.startsAt.getTime() + s.durationMin * 60000 > now.getTime())) {
    throw new UserError("You can only log hours for your own sessions after they're over.");
  }
  return s;
}

/** Tutor checks a completed session: its hours go to their teacher for sign-off. */
export async function logHours(tutorId: string, sessionId: string, now = new Date()) {
  const s = await ownLoggableSession(tutorId, sessionId, now);
  if (s.hourLog) throw new UserError(lockedMessage(s.hourLog.status));
  const hours = hoursFor(s.durationMin);
  try {
    await db.hourLog.create({ data: { sessionId, tutorId, hours, status: "logged" } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new UserError("Already logged.");
    throw err;
  }
  return { toast: `${hours}h sent to your teacher for sign-off` };
}

/** Tutor unchecks: only while the log is still waiting for sign-off (BACKEND.md › Hours). */
export async function unlogHours(tutorId: string, sessionId: string, now = new Date()) {
  const s = await ownLoggableSession(tutorId, sessionId, now);
  if (!s.hourLog) throw new UserError("Nothing logged for this session.");
  const { count } = await db.hourLog.deleteMany({ where: { id: s.hourLog.id, status: "logged" } });
  if (count === 0) throw new UserError(lockedMessage(s.hourLog.status));
  return { toast: `${Number(s.hourLog.hours)}h removed from your log` };
}

function lockedMessage(status: string) {
  if (status === "approved") return "Already approved by your teacher";
  if (status === "rejected") return "Rejected by your teacher. Ask them about it.";
  return "Already logged.";
}

/** Rows for the service-hour export (CSV/PDF), current school year. */
export async function hoursExport(tutorId: string, now = new Date()) {
  const year = schoolYear(now);
  const tutor = await db.user.findUniqueOrThrow({ where: { id: tutorId }, include: { school: { include: { slots: true } } } });
  const logs = await db.hourLog.findMany({
    where: { tutorId, session: { startsAt: { gte: year.start, lt: year.end } } },
    include: { session: { include: { subject: true, learner: { select: { name: true } } } }, reviewedBy: { select: { name: true } } },
    orderBy: { session: { startsAt: "asc" } },
  });
  const labels = new Map((tutor.school?.slots ?? []).map((s) => [s.startMinute, s.label]));
  return {
    tutorName: tutor.name ?? "",
    schoolName: tutor.school?.name ?? "",
    yearLabel: year.label,
    goal: tutor.school?.serviceHourGoal ?? 40,
    rows: logs.map((l) => ({
      date: l.session.startsAt.toISOString().slice(0, 10),
      when: sessionWhen(l.session.startsAt, labels),
      subject: l.session.subject.name,
      learner: displayName(l.session.learner.name),
      hours: Number(l.hours),
      status: l.status,
      learnerConfirmed: !!l.session.learnerConfirmedAt,
      reviewedBy: l.reviewedBy?.name ?? "",
      reviewedAt: l.reviewedAt ? l.reviewedAt.toISOString().slice(0, 10) : "",
    })),
    approvedTotal: sum(logs.filter((l) => l.status === "approved")),
  };
}
