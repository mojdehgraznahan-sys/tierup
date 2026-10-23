import "server-only";
import { db } from "@/server/db";
import { archiveConfigured, writeArchive } from "@/server/integrations/archive";
import { pseudonym, redact } from "@/lib/deidentify";

const DAY = 24 * 3600000;
/** Transcripts stay in TierUp this long (the privacy pop-up promises it). */
export const TRANSCRIPT_RETENTION_DAYS = 30;
const PER_RUN = 20;

/**
 * Job: transcripts older than 30 days leave the database. With TRANSCRIPT_ARCHIVE set, a de-identified
 * copy is archived first for program research (no names, contact details or user IDs; students are
 * one-way codes, so one student's sessions can still be followed over time).
 */
export async function archiveOldTranscripts(now = new Date()) {
  const cutoff = new Date(now.getTime() - TRANSCRIPT_RETENTION_DAYS * DAY);
  const sessions = await db.tutoringSession.findMany({
    where: { startsAt: { lt: cutoff }, transcript: { some: {} } },
    include: {
      transcript: { orderBy: { at: "asc" } },
      subject: { select: { name: true } },
      learner: { select: { id: true, name: true, grade: true, schoolId: true } },
      tutor: { select: { id: true, name: true, grade: true } },
      review: { select: { stars: true, happened: true } },
      summary: { select: { topics: true, nextSteps: true } },
    },
    take: PER_RUN,
  });

  const salt = process.env.ARCHIVE_SALT ?? "";
  let archived = 0;
  let deleted = 0;
  for (const s of sessions) {
    if (archiveConfigured()) {
      const people = [
        { role: "Tutor", name: s.tutor.name },
        { role: "Learner", name: s.learner.name },
      ];
      const month = s.startsAt.toISOString().slice(0, 7);
      try {
        await writeArchive(`transcripts/${month.replace("-", "/")}/${pseudonym(s.id, salt)}.json`, {
          version: 1,
          month,
          schoolId: s.learner.schoolId,
          subject: s.subject.name,
          format: s.format,
          durationMin: s.durationMin,
          source: s.transcriptSource,
          learner: { code: pseudonym(s.learner.id, salt), grade: s.learner.grade },
          tutor: { code: pseudonym(s.tutor.id, salt), grade: s.tutor.grade },
          rating: s.review?.stars ?? null,
          happened: s.review?.happened ?? null,
          summary: s.summary ? { topics: s.summary.topics.map((t) => redact(t, people)), nextSteps: s.summary.nextSteps.map((t) => redact(t, people)) } : null,
          lines: s.transcript.map((l) => ({ speaker: l.speaker, offsetSec: Math.round((l.at.getTime() - s.startsAt.getTime()) / 1000), text: redact(l.text, people) })),
        });
        archived++;
      } catch (err) {
        // Keep it in the database and retry on the next run rather than lose it.
        console.error(`Couldn't archive the transcript for session ${s.id}; will retry`, err);
        continue;
      }
    }
    deleted += (await db.transcriptSegment.deleteMany({ where: { sessionId: s.id } })).count > 0 ? 1 : 0;
  }
  return { archived, deleted };
}
