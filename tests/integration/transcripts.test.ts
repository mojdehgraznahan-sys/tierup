import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { setMeetProvider } from "@/server/integrations/meet";
import { FakeMeetProvider } from "@/server/integrations/meet/fake";
import { setSpeechToText } from "@/server/integrations/stt";
import { FakeSpeechToText } from "@/server/integrations/stt/fake";
import { setSummarizer } from "@/server/integrations/summarizer";
import { FakeSummarizer } from "@/server/integrations/summarizer/fake";
import { createBooking } from "@/server/services/booking";
import { completeAndReview, tutorWrapUp } from "@/server/services/lifecycle";
import { needsConsentPrompt, recordConsents } from "@/server/services/privacy-consent";
import { sessionsToSummarize, summarizeSessions } from "@/server/services/summaries";
import { archiveOldTranscripts } from "@/server/services/transcript-archive";
import { addMicClip, finishTranscripts, stopTranscribing, stopTranscribingUpcoming } from "@/server/services/transcripts";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

// Monday Oct 19 2026, 10:00 Eastern; the session is Tue Oct 20, 3:30–4:15 pm (19:30–20:15 UTC).
const NOW = new Date("2026-10-19T14:00:00Z");
const STARTS = "2026-10-20T19:30:00.000Z";
const DURING = new Date("2026-10-20T19:45:00Z");
const AFTER_WINDOW = new Date("2026-10-20T20:31:00Z");
const audio = Buffer.from("fake-opus-bytes");

let meet: FakeMeetProvider;
let stt: FakeSpeechToText;
let summarizer: FakeSummarizer;
beforeEach(async () => {
  vi.stubEnv("TRANSCRIPTS", "on");
  sent.length = 0;
  meet = new FakeMeetProvider();
  stt = new FakeSpeechToText();
  summarizer = new FakeSummarizer();
  setMeetProvider(meet);
  setSpeechToText(stt);
  setSummarizer(summarizer);
  await resetDb();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  setSummarizer(undefined);
  await db.$disconnect();
});

async function world(opts: { consent?: { learner: boolean; tutor: boolean }; tutorSchool?: "same" | "other"; format?: "online" | "in_person" } = {}) {
  const school = await makeSchool("Home High", ["home.test"]);
  const other = await makeSchool("Other High", ["other.test"]);
  const [algebra] = await makeSubjects("Algebra II");
  const learner = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: school.id, avail: [[2, 930]] });
  const tutorSchool = opts.tutorSchool === "other" ? other : school;
  const tutor = await makeTutor({ email: `tom@${opts.tutorSchool === "other" ? "other" : "home"}.test`, name: "Tom Tutor", schoolId: tutorSchool.id, subjects: { [algebra!.id]: "approved" }, avail: [[2, 930]] });
  const consent = opts.consent ?? { learner: true, tutor: true };
  await recordConsents(learner.id, { transcripts: consent.learner, analytics: false });
  await recordConsents(tutor.id, { transcripts: consent.tutor, analytics: true });
  if (opts.format === "in_person") await db.school.update({ where: { id: school.id }, data: { approvedSpaces: ["Library"] } });
  const { sessionId } = await createBooking(
    learner.id,
    { tutorId: tutor.id, subjectId: algebra!.id, startsAt: STARTS, format: opts.format ?? "online", location: opts.format === "in_person" ? "Library" : undefined },
    NOW,
  );
  const session = await db.tutoringSession.findUniqueOrThrow({ where: { id: sessionId } });
  return { school, learner, tutor, sessionId, session };
}

describe("privacy consent", () => {
  it("asks students until they answer the current version", async () => {
    const school = await makeSchool("Home High", ["home.test"]);
    const learner = await makeLearner({ email: "lea@home.test", schoolId: school.id });
    expect(await needsConsentPrompt(learner)).toBe(true);
    await recordConsents(learner.id, { transcripts: false, analytics: false });
    expect(await needsConsentPrompt(learner)).toBe(false);
    expect(await needsConsentPrompt({ id: "staff", roles: ["staff"] })).toBe(false);
  });
});

describe("deciding at booking", () => {
  it("transcribes with mic capture when both opted in at the same school", async () => {
    const w = await world();
    expect(w.session).toMatchObject({ transcribe: true, transcriptSource: "mic", meetOrganizer: null });
    expect(meet.created.at(-1)).toMatchObject({ organizer: null, autoTranscribe: false });
  });

  it("uses the school's own Google Workspace when it has Google Education", async () => {
    vi.stubEnv("GOOGLE_EDUCATION_SCHOOLS", "home.test=tierup@home.test");
    const w = await world();
    expect(w.session).toMatchObject({ transcribe: true, transcriptSource: "google_meet", meetOrganizer: "tierup@home.test" });
    expect(meet.created.at(-1)).toMatchObject({ organizer: "tierup@home.test", autoTranscribe: true });
  });

  it("uses mic capture for in-person sessions even at Google Education schools", async () => {
    vi.stubEnv("GOOGLE_EDUCATION_SCHOOLS", "home.test=tierup@home.test");
    const w = await world({ format: "in_person" });
    expect(w.session).toMatchObject({ transcribe: true, transcriptSource: "mic" });
  });

  it("doesn't transcribe without both opt-ins, across schools, or when transcripts are off", async () => {
    expect((await world({ consent: { learner: true, tutor: false } })).session.transcribe).toBe(false);
    await resetDb();
    expect((await world({ tutorSchool: "other" })).session.transcribe).toBe(false);
    await resetDb();
    vi.stubEnv("TRANSCRIPTS", "off");
    expect((await world()).session.transcribe).toBe(false);
  });
});

describe("mic capture", () => {
  it("transcribes clips during the session, labeled by who recorded them", async () => {
    const w = await world();
    await expect(addMicClip(w.learner.id, w.sessionId, audio, "audio/webm", NOW, NOW)).rejects.toThrow(/only open during the session/);
    stt.queue.push("Can you show me how to factor this?", "Sure, find two numbers that multiply to six.");
    expect(await addMicClip(w.learner.id, w.sessionId, audio, "audio/webm", DURING, DURING)).toEqual({ saved: true });
    await addMicClip(w.tutor.id, w.sessionId, audio, "audio/webm", DURING, DURING);
    const lines = await db.transcriptSegment.findMany({ where: { sessionId: w.sessionId }, orderBy: { createdAt: "asc" } });
    expect(lines.map((l) => `${l.speaker}: ${l.text}`)).toEqual(["Learner: Can you show me how to factor this?", "Tutor: Sure, find two numbers that multiply to six."]);

    stt.queue.push("");
    expect(await addMicClip(w.tutor.id, w.sessionId, audio, "audio/webm", DURING, DURING)).toEqual({ saved: false });
    await expect(addMicClip("someone-else", w.sessionId, audio, "audio/webm", DURING, DURING)).rejects.toThrow(/your own sessions/);
    await expect(addMicClip(w.tutor.id, w.sessionId, Buffer.alloc(3_000_000), "audio/webm", DURING, DURING)).rejects.toThrow(/too large/);
  });

  it("in person, only the tutor's device records, as one shared speaker", async () => {
    const w = await world({ format: "in_person" });
    await expect(addMicClip(w.learner.id, w.sessionId, audio, "audio/webm", DURING, DURING)).rejects.toThrow(/tutor's device/);
    await addMicClip(w.tutor.id, w.sessionId, audio, "audio/mp4", DURING, DURING);
    expect((await db.transcriptSegment.findFirstOrThrow()).speaker).toBe("Session");
  });

  it("stops accepting clips once either student withdraws consent", async () => {
    const w = await world();
    await recordConsents(w.tutor.id, { transcripts: false, analytics: true });
    await expect(addMicClip(w.learner.id, w.sessionId, audio, "audio/webm", DURING, DURING)).rejects.toThrow(/turned off/);
  });

  it("marks the transcript ready after the window closes, or empty if nothing was said", async () => {
    const w = await world();
    await addMicClip(w.learner.id, w.sessionId, audio, "audio/webm", DURING, DURING);
    expect(await finishTranscripts(DURING)).toEqual({});
    expect(await finishTranscripts(AFTER_WINDOW)).toEqual({ ready: 1 });
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } })).transcriptReadyAt).toEqual(AFTER_WINDOW);

    await resetDb();
    const quiet = await world();
    expect(await finishTranscripts(AFTER_WINDOW)).toEqual({ empty: 1 });
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: quiet.sessionId } })).transcriptFailure).toBe("empty");
  });
});

describe("Google Education schools", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_EDUCATION_SCHOOLS", "home.test=tierup@home.test"));

  it("fetches Meet's transcript once it's written, mapping speakers to tutor and learner", async () => {
    const w = await world();
    const space = w.session.meetSpaceName!;
    meet.transcripts.set(space, { state: "pending" });
    expect(await finishTranscripts(AFTER_WINDOW)).toEqual({});
    meet.transcripts.set(space, {
      state: "ready",
      lines: [
        { speakerName: "Tom Tutor", at: new Date("2026-10-20T19:31:00Z"), text: "Today we'll do factoring." },
        { speakerName: "Lea", at: new Date("2026-10-20T19:32:00Z"), text: "Okay, I have my quiz." },
        { speakerName: "Visitor", at: new Date("2026-10-20T19:33:00Z"), text: "Hi" },
      ],
    });
    expect(await finishTranscripts(AFTER_WINDOW)).toEqual({ ready: 1 });
    const lines = await db.transcriptSegment.findMany({ where: { sessionId: w.sessionId }, orderBy: { at: "asc" } });
    expect(lines.map((l) => l.speaker)).toEqual(["Tutor", "Learner", "Session"]);
  });

  it("gives up after three hours, and skips sessions whose consent was withdrawn", async () => {
    const w = await world();
    expect(await finishTranscripts(new Date("2026-10-20T23:20:00Z"))).toEqual({ not_found: 1 });
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } })).transcriptFailure).toBe("not_found");

    await resetDb();
    const v = await world();
    await recordConsents(v.learner.id, { transcripts: false, analytics: false });
    meet.transcripts.set(v.session.meetSpaceName!, { state: "ready", lines: [{ speakerName: "Lea", at: DURING, text: "hi" }] });
    expect(await finishTranscripts(AFTER_WINDOW)).toEqual({ consent_withdrawn: 1 });
    expect(await db.transcriptSegment.count()).toBe(0);
  });

  it("turns Meet's transcription off when a student opts the session out", async () => {
    const w = await world();
    expect(meet.autoTranscribe.get(w.session.meetSpaceName!)).toBe(true);
    await stopTranscribing(w.learner.id, w.sessionId, NOW);
    expect(meet.autoTranscribe.get(w.session.meetSpaceName!)).toBe(false);
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } })).transcribe).toBe(false);
  });
});

describe("opting out", () => {
  it("either student can turn it off before the start, not after", async () => {
    const w = await world();
    await expect(stopTranscribing(w.tutor.id, w.sessionId, DURING)).rejects.toThrow(/already started/);
    await stopTranscribing(w.tutor.id, w.sessionId, NOW);
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } })).transcribe).toBe(false);
  });

  it("withdrawing consent stops transcription for booked sessions", async () => {
    const w = await world();
    expect(await stopTranscribingUpcoming(w.learner.id, NOW)).toBe(1);
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } })).transcribe).toBe(false);
  });
});

describe("summary from the transcript", () => {
  it("waits for the transcript, then summarizes from it", async () => {
    const w = await world();
    stt.queue.push("Let's factor x squared plus five x plus six.");
    await addMicClip(w.tutor.id, w.sessionId, audio, "audio/webm", DURING, DURING);
    await completeAndReview(w.learner.id, w.sessionId, { happened: "yes", stars: 5 }, new Date("2026-10-20T20:20:00Z"));
    await tutorWrapUp(w.tutor.id, w.sessionId, { learnerShowedUp: true }, new Date("2026-10-20T20:20:00Z"));

    expect(await sessionsToSummarize(new Date("2026-10-20T20:25:00Z"))).toEqual([]); // transcript not ready yet
    await finishTranscripts(AFTER_WINDOW);
    expect(await summarizeSessions(AFTER_WINDOW)).toEqual({ done: 1 });
    expect(summarizer.calls[0]!.transcript.map((l) => `${l.speaker}: ${l.text}`)).toEqual(["Tutor: Let's factor x squared plus five x plus six."]);
  });
});

describe("30-day archive", () => {
  it("archives a de-identified copy, then deletes the transcript", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tierup-archive-"));
    vi.stubEnv("TRANSCRIPT_ARCHIVE", `file:${dir}`);
    vi.stubEnv("ARCHIVE_SALT", "s".repeat(40));
    const w = await world();
    stt.queue.push("Thanks Tom, email me at lea@home.test or text 301-555-0100 later.");
    await addMicClip(w.learner.id, w.sessionId, audio, "audio/webm", DURING, DURING);

    expect(await archiveOldTranscripts(new Date("2026-11-10T00:00:00Z"))).toEqual({ archived: 0, deleted: 0 }); // under 30 days
    expect(await archiveOldTranscripts(new Date("2026-11-21T00:00:00Z"))).toEqual({ archived: 1, deleted: 1 });
    expect(await db.transcriptSegment.count()).toBe(0);

    const [file] = await readdir(path.join(dir, "transcripts/2026/10"));
    const record = JSON.parse(await readFile(path.join(dir, "transcripts/2026/10", file!), "utf8"));
    expect(record.lines[0].text).toBe("Thanks [Tutor], email me at [email] or text [phone] later.");
    expect(record).toMatchObject({ month: "2026-10", subject: "Algebra II", learner: { grade: expect.any(Number) } });
    const raw = JSON.stringify(record);
    for (const secret of [w.learner.id, w.tutor.id, w.sessionId, "Tom", "Lea Learner", "lea@home.test", "555-0100"]) expect(raw).not.toContain(secret);
  });

  it("just deletes when no archive is configured", async () => {
    const w = await world();
    await addMicClip(w.learner.id, w.sessionId, audio, "audio/webm", DURING, DURING);
    expect(await archiveOldTranscripts(new Date("2026-11-21T00:00:00Z"))).toEqual({ archived: 0, deleted: 1 });
  });
});
