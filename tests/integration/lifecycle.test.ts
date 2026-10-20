import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { setMeetProvider } from "@/server/integrations/meet";
import { FakeMeetProvider } from "@/server/integrations/meet/fake";
import { createBooking } from "@/server/services/booking";
import { cancelSession, completeAndReview, saveTutorNotes } from "@/server/services/lifecycle";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

// Monday Oct 19 2026, 10:00 Eastern; the session is Tue Oct 20, 3:30 pm.
const NOW = new Date("2026-10-19T14:00:00Z");
const STARTS = "2026-10-20T19:30:00.000Z";
const DURING = new Date("2026-10-20T19:45:00Z");
const AFTER = new Date("2026-10-20T20:30:00Z");

let fake: FakeMeetProvider;
beforeEach(async () => {
  sent.length = 0;
  fake = new FakeMeetProvider();
  setMeetProvider(fake);
  await resetDb();
});
afterAll(() => db.$disconnect());

async function bookedWorld(format: "online" | "in_person" = "online") {
  const school = await makeSchool("Home High", ["home.test"]);
  const [algebra] = await makeSubjects("Algebra II");
  const learner = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: school.id, avail: [[2, 930]] });
  const tutor = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: school.id, subjects: { [algebra!.id]: "approved" }, avail: [[2, 930]] });
  const { sessionId } = await createBooking(
    learner.id,
    { tutorId: tutor.id, subjectId: algebra!.id, startsAt: STARTS, format, location: format === "in_person" ? "Library" : undefined },
    NOW,
  );
  sent.length = 0;
  return { learner, tutor, sessionId };
}

describe("complete & review", () => {
  it("confirms the session for hours, records the review and notifies tutor and parent", async () => {
    const w = await bookedWorld();
    const { toast } = await completeAndReview(w.learner.id, w.sessionId, { happened: "yes", stars: 5, tags: ["Patient", "On time"], comment: "Great!" }, AFTER);
    expect(toast).toBe("Thanks! Tom T. can now log their 0.75 hrs for teacher sign-off");

    const s = await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId }, include: { review: true } });
    expect(s.status).toBe("completed");
    expect(s.learnerConfirmedAt).toEqual(AFTER);
    expect(s.review).toMatchObject({ stars: 5, tags: ["Patient", "On time"], happened: "yes", comment: "Great!" });
    expect(await db.report.count()).toBe(0);
    expect(sent.map((e) => e.to).sort()).toEqual(["parent+lea@home.test", "tom@home.test"]);
  });

  it("only lets the learner review, once, after the session starts", async () => {
    const w = await bookedWorld();
    await expect(completeAndReview(w.learner.id, w.sessionId, { happened: "yes", stars: 4 }, NOW)).rejects.toThrow(/once the session has started/);
    await expect(completeAndReview(w.tutor.id, w.sessionId, { happened: "yes", stars: 4 }, AFTER)).rejects.toThrow(/your own sessions/);
    await expect(completeAndReview(w.learner.id, w.sessionId, { happened: "yes" }, AFTER)).rejects.toThrow(/at least 1 star/);
    await completeAndReview(w.learner.id, w.sessionId, { happened: "yes", stars: 4 }, DURING);
    await expect(completeAndReview(w.learner.id, w.sessionId, { happened: "yes", stars: 4 }, AFTER)).rejects.toThrow(/already been wrapped up/);
  });

  it("routes low ratings privately to staff", async () => {
    const w = await bookedWorld();
    await completeAndReview(w.learner.id, w.sessionId, { happened: "cut_short", stars: 2, comment: "Left early" }, AFTER);
    const s = await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } });
    expect(s.status).toBe("completed");
    const report = await db.report.findFirstOrThrow();
    expect(report).toMatchObject({ automatic: true, againstUserId: w.tutor.id, sessionId: w.sessionId, reason: "Low rating (2★): Left early" });
  });

  it("records a no-show without stars or hour confirmation, and tells staff", async () => {
    const w = await bookedWorld();
    const { toast } = await completeAndReview(w.learner.id, w.sessionId, { happened: "no_show", stars: 5, tags: ["Patient"] }, AFTER);
    expect(toast).toMatch(/School staff have been told/);
    const s = await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId }, include: { review: true } });
    expect(s.status).toBe("no_show");
    expect(s.learnerConfirmedAt).toBeNull();
    expect(s.review).toMatchObject({ stars: null, tags: [], happened: "no_show" });
    expect((await db.report.findFirstOrThrow()).reason).toMatch(/didn't show up/);
    expect(sent.map((e) => e.to)).toEqual(["parent+lea@home.test"]);
  });
});

describe("cancel", () => {
  it("lets either person cancel before the start, removes the Meet and notifies the others", async () => {
    const w = await bookedWorld();
    const session = await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } });
    await cancelSession(w.tutor.id, w.sessionId, { reason: "Sick" }, NOW);

    const s = await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } });
    expect(s).toMatchObject({ status: "cancelled", cancelledById: w.tutor.id, cancelReason: "Sick" });
    expect(fake.cancelled).toEqual([session.calendarEventId]);
    expect(sent.map((e) => e.to).sort()).toEqual(["lea@home.test", "parent+lea@home.test"]);

    await expect(cancelSession(w.learner.id, w.sessionId, {}, NOW)).rejects.toThrow(/can't be cancelled/);
  });

  it("refuses outsiders and sessions that already started", async () => {
    const w = await bookedWorld("in_person");
    const other = await makeLearner({ email: "max@home.test", schoolId: null });
    await expect(cancelSession(other.id, w.sessionId, {}, NOW)).rejects.toThrow(/your own sessions/);
    await expect(cancelSession(w.learner.id, w.sessionId, {}, DURING)).rejects.toThrow(/already started/);
    await cancelSession(w.learner.id, w.sessionId, {}, NOW);
    expect(fake.cancelled).toEqual([]); // in person: no calendar event
  });

  it("frees the slot for a new booking", async () => {
    const w = await bookedWorld();
    await cancelSession(w.learner.id, w.sessionId, {}, NOW);
    const s = await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } });
    const again = await createBooking(w.learner.id, { tutorId: w.tutor.id, subjectId: s.subjectId, startsAt: STARTS, format: "online" }, NOW);
    expect(again.sessionId).not.toBe(w.sessionId);
  });
});

describe("tutor notes", () => {
  it("saves notes for the tutor once the session has started", async () => {
    const w = await bookedWorld();
    await expect(saveTutorNotes(w.tutor.id, w.sessionId, "Worked on factoring", NOW)).rejects.toThrow(/once the session has started/);
    await expect(saveTutorNotes(w.learner.id, w.sessionId, "hi", DURING)).rejects.toThrow(/your own sessions/);
    expect((await saveTutorNotes(w.tutor.id, w.sessionId, "Worked on factoring", DURING)).toast).toMatch(/Waiting for the learner/);
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: w.sessionId } })).tutorNotes).toBe("Worked on factoring");
  });
});
