import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { sendEmailSafely } from "@/server/email/send";
import { aiSessionSummaryEmail, aiSessionSummaryParentEmail } from "@/server/email/templates";
import { getSummarizer } from "@/server/integrations/summarizer";
import { parentFyiRecipient, parentOptOutToken } from "@/server/services/parent-fyi";
import { sessionWhen } from "@/server/services/sessions";
import { transcriptLines } from "@/server/services/transcripts";
import { displayName } from "@/lib/names";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const HOUR = 3600000;
/** Sessions older than this are never summarized (keeps the job's query small). */
const LOOKBACK_DAYS = 7;
/** Without the tutor's wrap-up, wait this long after the start so their notes can land. */
const WAIT_FOR_NOTES_HOURS = 24;
/** Longest wait for a transcript before summarizing from notes and chat alone. */
const WAIT_FOR_TRANSCRIPT_HOURS = 4;
/** Chat this long after the session still counts (follow-up questions). */
const CHAT_AFTER_HOURS = 24;
const MAX_MESSAGES = 150;
const PER_RUN = 5;

/**
 * Sessions ready for a summary: someone confirmed it happened (the learner's review, or the tutor
 * said the learner showed up), nobody said it didn't, it has ended, and either the tutor has wrapped
 * up or a day has passed.
 */
export async function sessionsToSummarize(now = new Date()) {
  const rows = await db.tutoringSession.findMany({
    where: {
      summary: { is: null },
      startsAt: { gte: new Date(now.getTime() - LOOKBACK_DAYS * 24 * HOUR), lt: now },
      OR: [
        // Spelled out: "not false" in SQL also drops NULL (the tutor hasn't answered).
        { status: "completed", OR: [{ learnerShowedUp: null }, { learnerShowedUp: true }] },
        { status: "confirmed", learnerShowedUp: true },
      ],
      AND: [
        { OR: [{ tutorWrappedUpAt: { not: null } }, { startsAt: { lt: new Date(now.getTime() - WAIT_FOR_NOTES_HOURS * HOUR) } }] },
        // A transcript on its way: wait for it (or for finishTranscripts to give up), at most a few hours.
        {
          OR: [
            { transcribe: false },
            { transcriptReadyAt: { not: null } },
            { transcriptFailure: { not: null } },
            { startsAt: { lt: new Date(now.getTime() - WAIT_FOR_TRANSCRIPT_HOURS * HOUR) } },
          ],
        },
      ],
    },
    select: { id: true, startsAt: true, durationMin: true },
    orderBy: { startsAt: "asc" },
  });
  return rows.filter((s) => s.startsAt.getTime() + s.durationMin * 60000 <= now.getTime()).map((s) => s.id);
}

/**
 * Summarizes one session and emails the learner and tutor. The SessionSummary row is created first
 * as a claim, so overlapping job runs never summarize (or bill) the same session twice, and a
 * failure is recorded instead of retried.
 */
export async function summarizeSession(sessionId: string, now = new Date()): Promise<"done" | "skipped" | "failed" | "off"> {
  const summarizer = await getSummarizer();
  if (!summarizer) return "off";

  try {
    await db.sessionSummary.create({ data: { sessionId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "skipped";
    throw err;
  }

  const s = await db.tutoringSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: {
      subject: true,
      tutor: { select: { name: true, email: true } },
      learner: { select: { id: true, name: true, email: true, parentEmail: true, parentSummariesOff: true, consent: true, school: { include: { slots: true } } } },
    },
  });
  // The latest messages up to a day after the session (pre-booking chat included), oldest first.
  const messages = await db.message.findMany({
    where: { threadId: s.threadId, flagged: false, createdAt: { lte: new Date(s.startsAt.getTime() + s.durationMin * 60000 + CHAT_AFTER_HOURS * HOUR) } },
    orderBy: { createdAt: "desc" },
    take: MAX_MESSAGES,
  });
  const when = sessionWhen(s.startsAt, new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label])));

  let result;
  try {
    result = await summarizer.summarize({
      subject: s.subject.name,
      when,
      durationMin: s.durationMin,
      tutorNotes: s.tutorNotes,
      transcript: s.transcribe && s.transcriptReadyAt ? await transcriptLines(s.id) : [],
      messages: messages
        .reverse()
        .map((m) => ({ from: m.senderId === s.tutorId ? ("Tutor" as const) : ("Learner" as const), at: m.createdAt, body: m.body })),
    });
  } catch (err) {
    console.error(`Session summary failed for ${s.id}`, err);
    await db.sessionSummary.update({ where: { sessionId }, data: { failure: "error" } });
    return "failed";
  }

  if (!result.ok) {
    await db.sessionSummary.update({ where: { sessionId }, data: { failure: result.failure } });
    return "skipped";
  }

  await db.sessionSummary.update({
    where: { sessionId },
    data: { topics: result.topics, nextSteps: result.nextSteps, model: result.model, generatedAt: now },
  });

  const url = `${appUrl()}/sessions/${s.threadId}`;
  const email = (to: string, otherName: string) =>
    aiSessionSummaryEmail({ to, otherName, subject: s.subject.name, when, topics: result.topics, nextSteps: result.nextSteps, url });
  await sendEmailSafely(email(s.learner.email, displayName(s.tutor.name)));
  await sendEmailSafely(email(s.tutor.email, displayName(s.learner.name)));
  const parent = parentFyiRecipient(s.learner);
  if (parent) {
    await sendEmailSafely(
      aiSessionSummaryParentEmail({
        to: parent,
        studentName: displayName(s.learner.name),
        tutorName: displayName(s.tutor.name),
        subject: s.subject.name,
        when,
        topics: result.topics,
        nextSteps: result.nextSteps,
        stopUrl: `${appUrl()}/parent-updates/${await parentOptOutToken(s.learner.id)}`,
      }),
    );
  }
  await db.sessionSummary.update({ where: { sessionId }, data: { emailedAt: new Date() } });
  return "done";
}

/** Job: summarize a few ready sessions per run, one at a time. */
export async function summarizeSessions(now = new Date()) {
  if (!(await getSummarizer())) return { off: true };
  const ids = (await sessionsToSummarize(now)).slice(0, PER_RUN);
  const results: Record<string, number> = {};
  for (const id of ids) {
    const r = await summarizeSession(id, now);
    results[r] = (results[r] ?? 0) + 1;
  }
  return results;
}
