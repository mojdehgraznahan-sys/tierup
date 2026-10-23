import "server-only";
import type { Format } from "@prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { getMeetProvider } from "@/server/integrations/meet";
import { getSpeechToText } from "@/server/integrations/stt";
import { consume } from "@/server/rate-limit";
import { googleEducationOrganizer, transcriptsEnabled } from "@/server/policies/rules";
import { bothAllowTranscripts } from "@/server/services/privacy-consent";
import { speakerFor } from "@/server/integrations/meet/speakers";

const MIN = 60000;
/** Mic capture is accepted from shortly before the start until a little after the end. */
export const MIC_OPENS_MIN = 10;
export const MIC_CLOSES_MIN = 15;
/** Meet can take a while to write its transcript; after this, summarize without it. */
const GOOGLE_WAIT_MIN = 180;
export const CLIP_MAX_BYTES = 2_000_000;
const CLIPS_PER_HOUR = 200;

export type TranscriptPlan = { transcribe: boolean; source: "google_meet" | "mic" | null; organizer: string | null };

/**
 * Decided at booking: transcribe only when transcripts are on, both students opted in, and they're
 * at the same school. Online sessions at Google Workspace for Education schools are transcribed by
 * Meet; everything else (other schools, in person) by TierUp's mic capture.
 */
export async function planTranscript(s: { learnerId: string; tutorId: string; format: Format; learnerSchoolId: string | null; tutorSchoolId: string | null }): Promise<TranscriptPlan> {
  const off = { transcribe: false, source: null, organizer: null } as const;
  if (!transcriptsEnabled() || !s.learnerSchoolId || s.learnerSchoolId !== s.tutorSchoolId) return off;
  if (!(await bothAllowTranscripts(s.learnerId, s.tutorId))) return off;
  if (s.format === "online") {
    const school = await db.school.findUnique({ where: { id: s.learnerSchoolId }, select: { staffEmailDomains: true } });
    const organizer = googleEducationOrganizer(school?.staffEmailDomains ?? []);
    if (organizer) return { transcribe: true, source: "google_meet", organizer };
  }
  return { transcribe: true, source: "mic", organizer: null };
}

const sessionEnd = (s: { startsAt: Date; durationMin: number }) => s.startsAt.getTime() + s.durationMin * MIN;

/** When the TierUp page may record: from MIC_OPENS_MIN before the start to MIC_CLOSES_MIN after the end. */
export function micWindow(s: { startsAt: Date; durationMin: number }) {
  return { opens: new Date(s.startsAt.getTime() - MIC_OPENS_MIN * MIN), closes: new Date(sessionEnd(s) + MIC_CLOSES_MIN * MIN) };
}

/**
 * One clip (about 30 s) from a student's TierUp session page: transcribed right away and labeled by
 * who recorded it. The audio is never stored. In person, one device (the tutor's) records both.
 */
export async function addMicClip(userId: string, sessionId: string, audio: Buffer, mimeType: string, startedAt: Date, now = new Date()) {
  const s = await db.tutoringSession.findUnique({ where: { id: sessionId } });
  if (!s || (s.learnerId !== userId && s.tutorId !== userId)) throw new UserError("You can only transcribe your own sessions.");
  if (!s.transcribe || s.transcriptSource !== "mic") throw new UserError("This session isn't being transcribed.");
  if (s.status === "cancelled" || s.status === "no_show") throw new UserError("This session didn't happen.");
  const { opens, closes } = micWindow(s);
  if (now < opens || now > closes) throw new UserError("Transcription is only open during the session.");
  const isTutor = s.tutorId === userId;
  if (s.format === "in_person" && !isTutor) throw new UserError("Your tutor's device transcribes in-person sessions.");
  if (!(await bothAllowTranscripts(s.learnerId, s.tutorId))) throw new UserError("Transcription was turned off for this session.");
  if (audio.length === 0 || audio.length > CLIP_MAX_BYTES) throw new UserError("That recording clip is too large.");
  if (!(await consume(`transcript-clip:${userId}`, CLIPS_PER_HOUR, 60 * MIN, now)).ok) throw new UserError("Too many clips. Try again shortly.");

  const text = (await (await getSpeechToText()).transcribe(audio, mimeType)).trim();
  if (!text) return { saved: false };
  const at = startedAt >= opens && startedAt <= now ? startedAt : now;
  await db.transcriptSegment.create({
    data: { sessionId, speaker: s.format === "in_person" ? "Session" : isTutor ? "Tutor" : "Learner", at, text },
  });
  return { saved: true };
}

/** A student withdrew transcription consent: stop it for every session of theirs that hasn't ended. */
export async function stopTranscribingUpcoming(userId: string, now = new Date()) {
  const sessions = await db.tutoringSession.findMany({
    where: { transcribe: true, transcriptReadyAt: null, OR: [{ learnerId: userId }, { tutorId: userId }], status: "confirmed", startsAt: { gte: new Date(now.getTime() - 3 * 60 * MIN) } },
  });
  for (const s of sessions) {
    await db.tutoringSession.update({ where: { id: s.id }, data: { transcribe: false } });
    if (s.transcriptSource === "google_meet" && s.meetSpaceName) {
      await (await getMeetProvider()).setAutoTranscribe({ spaceName: s.meetSpaceName, organizer: s.meetOrganizer }, false).catch((err) => console.error(err));
    }
  }
  return sessions.length;
}

/** Either student turns transcription off for one session, any time before it starts. */
export async function stopTranscribing(userId: string, sessionId: string, now = new Date()) {
  const s = await db.tutoringSession.findUnique({ where: { id: sessionId } });
  if (!s || (s.learnerId !== userId && s.tutorId !== userId)) throw new UserError("You can only change your own sessions.");
  if (!s.transcribe) return { toast: "This session isn't being transcribed." };
  if (s.startsAt <= now) throw new UserError("The session has already started.");
  await db.tutoringSession.update({ where: { id: s.id }, data: { transcribe: false } });
  if (s.transcriptSource === "google_meet" && s.meetSpaceName) {
    try {
      await (await getMeetProvider()).setAutoTranscribe({ spaceName: s.meetSpaceName, organizer: s.meetOrganizer }, false);
    } catch (err) {
      // The fetch job also skips sessions with transcribe=false, so nothing reaches TierUp either way.
      console.error(`Couldn't turn off Meet transcription for session ${s.id}`, err);
    }
  }
  return { toast: "This session won't be transcribed." };
}

/**
 * Job: marks transcripts ready once a session is over. Mic transcripts are complete shortly after
 * the end; Meet transcripts are fetched from the school's Workspace once Google has written them.
 */
export async function finishTranscripts(now = new Date()) {
  const sessions = await db.tutoringSession.findMany({
    where: {
      transcribe: true,
      transcriptReadyAt: null,
      transcriptFailure: null,
      status: { in: ["confirmed", "completed"] },
      startsAt: { lt: now, gte: new Date(now.getTime() - 2 * 24 * 60 * MIN) },
    },
    include: { tutor: { select: { name: true } }, learner: { select: { name: true } }, _count: { select: { transcript: true } } },
  });
  const done: Record<string, number> = {};
  const count = (k: string) => (done[k] = (done[k] ?? 0) + 1);

  for (const s of sessions) {
    const end = sessionEnd(s);
    if (s.transcriptSource === "mic") {
      if (now.getTime() < end + MIC_CLOSES_MIN * MIN) continue;
      await db.tutoringSession.update({ where: { id: s.id }, data: s._count.transcript > 0 ? { transcriptReadyAt: now } : { transcriptFailure: "empty" } });
      count(s._count.transcript > 0 ? "ready" : "empty");
      continue;
    }

    // Google Meet (school Workspace).
    if (now.getTime() < end) continue;
    const giveUp = now.getTime() > end + GOOGLE_WAIT_MIN * MIN;
    if (!(await bothAllowTranscripts(s.learnerId, s.tutorId))) {
      await db.tutoringSession.update({ where: { id: s.id }, data: { transcriptFailure: "consent_withdrawn" } });
      count("consent_withdrawn");
      continue;
    }
    let result;
    try {
      result = await (await getMeetProvider()).fetchTranscript({ spaceName: s.meetSpaceName, organizer: s.meetOrganizer });
    } catch (err) {
      console.error(`Couldn't fetch the Meet transcript for session ${s.id}; will retry`, err);
      continue;
    }
    if (result.state !== "ready") {
      if (giveUp) {
        await db.tutoringSession.update({ where: { id: s.id }, data: { transcriptFailure: "not_found" } });
        count("not_found");
      }
      continue;
    }
    const people = [
      { label: "Tutor", name: s.tutor.name },
      { label: "Learner", name: s.learner.name },
    ];
    await db.$transaction([
      db.transcriptSegment.createMany({
        data: result.lines.map((l) => ({ sessionId: s.id, speaker: speakerFor(l.speakerName, people) ?? "Session", at: l.at, text: l.text })),
      }),
      db.tutoringSession.update({ where: { id: s.id }, data: result.lines.length ? { transcriptReadyAt: now } : { transcriptFailure: "empty" } }),
    ]);
    count(result.lines.length ? "ready" : "empty");
  }
  return done;
}

/** The session's transcript, oldest line first (for the summarizer). */
export async function transcriptLines(sessionId: string) {
  return db.transcriptSegment.findMany({ where: { sessionId }, orderBy: { at: "asc" }, select: { speaker: true, at: true, text: true } });
}
