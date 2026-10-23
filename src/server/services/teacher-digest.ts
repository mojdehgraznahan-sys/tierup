import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { sendEmailSafely } from "@/server/email/send";
import { teacherDigestEmail } from "@/server/email/templates";
import { sessionWhen } from "@/server/services/sessions";
import { displayName } from "@/lib/names";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
/** Summaries older than this when the digest first sees them are skipped (e.g. after an outage). */
const LOOKBACK_DAYS = 14;

/** Signs a teacher's email so only the link we sent can turn off their digest. */
export function digestStopSignature(email: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "dev-secret").update(`digest-stop:${email.toLowerCase()}`).digest("base64url").slice(0, 32);
}

export function digestStopUrl(email: string): string {
  return `${appUrl()}/digest/stop?email=${encodeURIComponent(email.toLowerCase())}&sig=${digestStopSignature(email)}`;
}

/** Turns the digest off for a teacher, if the link's signature matches. */
export async function stopTeacherDigest(email: string, sig: string): Promise<boolean> {
  const want = Buffer.from(digestStopSignature(email));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  await db.digestOptOut.upsert({ where: { email: email.toLowerCase() }, create: { email: email.toLowerCase() }, update: {} });
  return true;
}

/**
 * Weekly job: one email per class teacher with their students' session summaries since the last
 * digest. Teachers come from the class details learners add to each subject. Every summary seen is
 * marked (sent or not), so nothing is ever included twice and overlapping runs can't double-send.
 */
export async function sendTeacherDigests(now = new Date()) {
  // Claim everything new in one statement; overlapping runs each get their own rows.
  const { count } = await db.sessionSummary.updateMany({
    where: { generatedAt: { not: null, gte: new Date(now.getTime() - LOOKBACK_DAYS * 86400000) }, teacherDigestedAt: null },
    data: { teacherDigestedAt: now },
  });
  if (count === 0) return { teachers: 0, sessions: 0 };

  const summaries = await db.sessionSummary.findMany({
    where: { teacherDigestedAt: now },
    include: {
      session: {
        include: {
          subject: true,
          tutor: { select: { name: true } },
          learner: { select: { name: true, school: { include: { slots: true } }, learnerSubjects: true } },
        },
      },
    },
    orderBy: { session: { startsAt: "asc" } },
  });
  const optedOut = new Set((await db.digestOptOut.findMany({ select: { email: true } })).map((o) => o.email));

  const byTeacher = new Map<string, { teacherName: string | null; sessions: Parameters<typeof teacherDigestEmail>[0]["sessions"] }>();
  for (const sum of summaries) {
    const s = sum.session;
    const cls = s.learner.learnerSubjects.find((l) => l.subjectId === s.subjectId);
    const teacher = cls?.teacherEmail?.toLowerCase();
    if (!teacher || optedOut.has(teacher)) continue;
    const entry = byTeacher.get(teacher) ?? { teacherName: cls?.teacherName ?? null, sessions: [] };
    entry.sessions.push({
      studentName: displayName(s.learner.name),
      className: cls?.className ?? null,
      subject: s.subject.name,
      tutorName: displayName(s.tutor.name),
      when: sessionWhen(s.startsAt, new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label]))),
      topics: sum.topics,
      nextSteps: sum.nextSteps,
    });
    byTeacher.set(teacher, entry);
  }

  for (const [to, { teacherName, sessions }] of byTeacher) {
    await sendEmailSafely(teacherDigestEmail({ to, teacherName, sessions, stopUrl: digestStopUrl(to) }));
  }
  return { teachers: byTeacher.size, sessions: [...byTeacher.values()].reduce((n, t) => n + t.sessions.length, 0) };
}
