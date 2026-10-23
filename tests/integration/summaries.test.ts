import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { setMeetProvider } from "@/server/integrations/meet";
import { FakeMeetProvider } from "@/server/integrations/meet/fake";
import { setSummarizer, type Summarizer } from "@/server/integrations/summarizer";
import { FakeSummarizer } from "@/server/integrations/summarizer/fake";
import { createBooking } from "@/server/services/booking";
import { completeAndReview, saveTutorNotes, tutorWrapUp } from "@/server/services/lifecycle";
import { sessionsToSummarize, summarizeSession, summarizeSessions } from "@/server/services/summaries";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

// Monday Oct 19 2026, 10:00 Eastern; the session is Tue Oct 20, 3:30–4:15 pm.
const NOW = new Date("2026-10-19T14:00:00Z");
const STARTS = "2026-10-20T19:30:00.000Z";
const DURING = new Date("2026-10-20T19:45:00Z");
const AFTER = new Date("2026-10-20T20:30:00Z");
const NEXT_DAY = new Date("2026-10-21T20:30:00Z");

let fake: FakeSummarizer;
beforeEach(async () => {
  sent.length = 0;
  setMeetProvider(new FakeMeetProvider());
  fake = new FakeSummarizer();
  setSummarizer(fake);
  await resetDb();
});
afterAll(async () => {
  setSummarizer(undefined);
  await db.$disconnect();
});

async function bookedWorld() {
  const school = await makeSchool("Home High", ["home.test"]);
  const [algebra] = await makeSubjects("Algebra II");
  const learner = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: school.id, avail: [[2, 930]] });
  const tutor = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: school.id, subjects: { [algebra!.id]: "approved" }, avail: [[2, 930]] });
  const { sessionId } = await createBooking(learner.id, { tutorId: tutor.id, subjectId: algebra!.id, startsAt: STARTS, format: "online" }, NOW);
  const { threadId } = await db.tutoringSession.findUniqueOrThrow({ where: { id: sessionId } });
  sent.length = 0;
  return { learner, tutor, sessionId, threadId };
}

const say = (threadId: string, senderId: string, body: string, createdAt: Date, flagged = false) =>
  db.message.create({ data: { threadId, senderId, body, createdAt, flagged } });

describe("which sessions get a summary", () => {
  it("waits for the tutor's wrap-up, or a day after a learner-confirmed session", async () => {
    const w = await bookedWorld();
    expect(await sessionsToSummarize(DURING)).toEqual([]);
    await completeAndReview(w.learner.id, w.sessionId, { happened: "yes", stars: 5 }, AFTER);
    expect(await sessionsToSummarize(AFTER)).toEqual([]); // the tutor may still add notes
    expect(await sessionsToSummarize(NEXT_DAY)).toEqual([w.sessionId]);

    await tutorWrapUp(w.tutor.id, w.sessionId, { learnerShowedUp: true }, AFTER);
    expect(await sessionsToSummarize(AFTER)).toEqual([w.sessionId]);
  });

  it("skips sessions that didn't happen or that people disagree about", async () => {
    const w = await bookedWorld();
    await tutorWrapUp(w.tutor.id, w.sessionId, { learnerShowedUp: false }, AFTER);
    expect(await sessionsToSummarize(NEXT_DAY)).toEqual([]);

    await resetDb();
    const d = await bookedWorld();
    await completeAndReview(d.learner.id, d.sessionId, { happened: "yes", stars: 4 }, AFTER);
    await tutorWrapUp(d.tutor.id, d.sessionId, { learnerShowedUp: false }, AFTER);
    expect(await sessionsToSummarize(NEXT_DAY)).toEqual([]);

    await resetDb();
    const t = await bookedWorld();
    await completeAndReview(t.learner.id, t.sessionId, { happened: "no_show" }, AFTER);
    expect(await sessionsToSummarize(NEXT_DAY)).toEqual([]);
  });
});

describe("summarizing", () => {
  it("summarizes notes and chat, emails the learner and tutor, and never repeats", async () => {
    const w = await bookedWorld();
    await say(w.threadId, w.learner.id, "Can we do factoring?", new Date("2026-10-19T15:00:00Z"));
    await say(w.threadId, w.tutor.id, "text me at 555-0100", new Date("2026-10-19T15:05:00Z"), true);
    await say(w.threadId, w.learner.id, "Thanks, that helped!", new Date("2026-10-20T21:00:00Z"));
    await say(w.threadId, w.learner.id, "Unrelated, weeks later", new Date("2026-11-02T15:00:00Z"));
    await saveTutorNotes(w.tutor.id, w.sessionId, "Factoring trinomials. Difference of squares", DURING);
    await tutorWrapUp(w.tutor.id, w.sessionId, { learnerShowedUp: true, feedback: "Staff only: seemed tired" }, AFTER);

    expect(await summarizeSessions(AFTER)).toEqual({ done: 1 });

    const input = fake.calls[0]!;
    expect(input.tutorNotes).toBe("Factoring trinomials. Difference of squares");
    expect(input.messages.map((m) => `${m.from}: ${m.body}`)).toEqual(["Learner: Can we do factoring?", "Learner: Thanks, that helped!"]);
    expect(JSON.stringify(input)).not.toMatch(/seemed tired|555-0100/);

    const summary = await db.sessionSummary.findUniqueOrThrow({ where: { sessionId: w.sessionId } });
    expect(summary).toMatchObject({ topics: ["Factoring trinomials", "Difference of squares"], model: "fake", generatedAt: AFTER, failure: null });
    expect(summary.emailedAt).not.toBeNull();
    expect(sent.map((e) => e.to).sort()).toEqual(["lea@home.test", "parent+lea@home.test", "tom@home.test"]); // parent: FYI (consent on, summaries chosen)
    expect(sent[0]!.text).toMatch(/Factoring trinomials/);

    expect(await summarizeSessions(NEXT_DAY)).toEqual({});
    expect(fake.calls).toHaveLength(1);
  });

  it("claims each session once, even when runs overlap", async () => {
    const w = await bookedWorld();
    await saveTutorNotes(w.tutor.id, w.sessionId, "Factoring", DURING);
    await tutorWrapUp(w.tutor.id, w.sessionId, { learnerShowedUp: true }, AFTER);
    const results = await Promise.all([summarizeSession(w.sessionId, AFTER), summarizeSession(w.sessionId, AFTER)]);
    expect(results.sort()).toEqual(["done", "skipped"]);
    expect(fake.calls).toHaveLength(1);
  });

  it("records a session with nothing to summarize, without emailing or retrying", async () => {
    const w = await bookedWorld();
    await tutorWrapUp(w.tutor.id, w.sessionId, { learnerShowedUp: true }, AFTER);
    expect(await summarizeSessions(AFTER)).toEqual({ skipped: 1 });
    expect(await db.sessionSummary.findUniqueOrThrow({ where: { sessionId: w.sessionId } })).toMatchObject({ failure: "not_enough_info", generatedAt: null });
    expect(sent).toHaveLength(0);
    expect(await sessionsToSummarize(NEXT_DAY)).toEqual([]);
  });

  it("records an API error instead of retrying it every run", async () => {
    const failing: Summarizer = { summarize: async () => { throw new Error("overloaded"); } };
    setSummarizer(failing);
    const w = await bookedWorld();
    await tutorWrapUp(w.tutor.id, w.sessionId, { learnerShowedUp: true }, AFTER);
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect(await summarizeSessions(AFTER)).toEqual({ failed: 1 });
    expect((await db.sessionSummary.findUniqueOrThrow({ where: { sessionId: w.sessionId } })).failure).toBe("error");
    expect(await sessionsToSummarize(NEXT_DAY)).toEqual([]);
  });

  it("does nothing when summaries are off", async () => {
    setSummarizer(null);
    const w = await bookedWorld();
    await tutorWrapUp(w.tutor.id, w.sessionId, { learnerShowedUp: true }, AFTER);
    expect(await summarizeSessions(AFTER)).toEqual({ off: true });
    expect(await db.sessionSummary.count()).toBe(0);
  });
});
