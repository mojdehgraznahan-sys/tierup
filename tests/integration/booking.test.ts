import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { bookingGrid, createBooking } from "@/server/services/booking";
import { setMeetProvider, type MeetProvider } from "@/server/integrations/meet";
import { FakeMeetProvider } from "@/server/integrations/meet/fake";
import { getOrCreatePreBookingThread } from "@/server/services/threads";
import { sendMessage } from "@/server/services/messaging";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

// Monday Oct 19 2026, 10:00 Eastern.
const NOW = new Date("2026-10-19T14:00:00Z");
const TUE_330 = "2026-10-20T19:30:00.000Z";
const THU_LUNCH = "2026-10-22T16:10:00.000Z";

let fake: FakeMeetProvider;
beforeEach(async () => {
  sent.length = 0;
  fake = new FakeMeetProvider();
  setMeetProvider(fake);
  await resetDb();
});
afterAll(() => db.$disconnect());

async function world() {
  const home = await makeSchool("Home High", ["home.test"]);
  const other = await makeSchool("Other High", ["other.test"]);
  const [algebra] = await makeSubjects("Algebra II");
  const both: [number, number][] = [[2, 930], [4, 730]];
  const learner = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: home.id, avail: [...both, [1, 1140]] });
  const tutor = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: home.id, subjects: { [algebra!.id]: "approved" }, avail: [...both, [5, 990]] });
  const remote = await makeTutor({ email: "rae@other.test", name: "Rae Remote", schoolId: other.id, subjects: { [algebra!.id]: "approved" }, avail: both });
  return { home, other, algebra: algebra!, learner, tutor, remote };
}

const book = (w: Awaited<ReturnType<typeof world>>, over: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(w.learner.id, { tutorId: w.tutor.id, subjectId: w.algebra.id, startsAt: TUE_330, format: "online", ...over }, NOW);

describe("booking grid", () => {
  it("opens only slots where both are free", async () => {
    const w = await world();
    const grid = await bookingGrid(w.learner.id, w.tutor.id, undefined, NOW);
    const open = grid!.cells.filter((c) => c.state === "open").map((c) => c.startsAt).sort();
    expect(open).toEqual([THU_LUNCH, TUE_330].sort());
    expect(grid!.weekLabel).toBe("Week of Oct 19 – 23");
    expect(grid!.formats).toEqual(["in_person", "online"]);
    expect(grid!.prevWeek).toBeNull();
    expect(grid!.nextWeek).toBe("2026-10-26");
  });

  it("offers other-school tutors online only", async () => {
    const w = await world();
    const grid = await bookingGrid(w.learner.id, w.remote.id, undefined, NOW);
    expect(grid!.formats).toEqual(["online"]);
    expect(grid!.spaces).toEqual([]);
  });
});

describe("createBooking", () => {
  it("books online with a one-time Meet, reuses the pre-booking chat and notifies everyone", async () => {
    const w = await world();
    const thread = await getOrCreatePreBookingThread(w.learner.id, { tutorId: w.tutor.id, subjectId: w.algebra.id });
    await sendMessage(w.learner, thread.id, "Can we do factoring?");

    const { sessionId, threadId } = await book(w, { threadId: thread.id });
    expect(threadId).toBe(thread.id);
    const s = await db.tutoringSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s).toMatchObject({ status: "confirmed", format: "online", durationMin: 45, source: "direct" });
    expect(s.startsAt.toISOString()).toBe(TUE_330);
    expect(s.meetUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(s.calendarEventId).toBe(`fake-${sessionId}`);
    expect(fake.created[0]!.attendees.map((a) => a.email)).toEqual(["lea@home.test", "tom@home.test"]);
    expect(await db.message.count({ where: { threadId } })).toBe(1);

    expect(sent.map((e) => e.to).sort()).toEqual(["lea@home.test", "parent+lea@home.test", "tom@home.test"]);
  });

  it("books in person only at an approved space at the same school", async () => {
    const w = await world();
    await expect(book(w, { format: "in_person", location: "Parking lot" })).rejects.toThrow(/approved spaces/);
    const { sessionId } = await book(w, { format: "in_person", location: "Library" });
    const s = await db.tutoringSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(s).toMatchObject({ format: "in_person", location: "Library", meetUrl: null });
    await expect(
      createBooking(w.learner.id, { tutorId: w.remote.id, subjectId: w.algebra.id, startsAt: THU_LUNCH, format: "in_person", location: "Library" }, NOW),
    ).rejects.toThrow(/same school/);
  });

  it("requires parent consent", async () => {
    const w = await world();
    await db.parentConsent.update({ where: { studentId: w.learner.id }, data: { status: "pending" } });
    await expect(book(w)).rejects.toThrow(/parent approves/);
  });

  it("rejects times that aren't open for both, too soon, or off-grid", async () => {
    const w = await world();
    await expect(book(w, { startsAt: "2026-10-19T23:00:00.000Z" })).rejects.toThrow(/not both free/); // Mon 7pm: learner only
    await expect(book(w, { startsAt: "2026-10-20T19:31:00.000Z" })).rejects.toThrow(/open time/);
    await expect(createBooking(w.learner.id, { tutorId: w.tutor.id, subjectId: w.algebra.id, startsAt: TUE_330, format: "online" }, new Date("2026-10-20T19:00:00Z"))).rejects.toThrow(/too soon/);
    await expect(book(w, { startsAt: "2026-12-01T20:30:00.000Z" })).rejects.toThrow(/next few weeks/);
  });

  it("prevents double booking and enforces the tutor's weekly cap", async () => {
    const w = await world();
    await book(w);
    await expect(book(w)).rejects.toThrow(/just taken/);

    await db.tutorStatus.update({ where: { tutorId: w.tutor.id }, data: { weeklyCap: 1 } });
    await expect(book(w, { startsAt: THU_LUNCH })).rejects.toThrow(/fully booked/);
    const grid = await bookingGrid(w.learner.id, w.tutor.id, undefined, NOW);
    expect(grid!.capReached).toBe(true);
    expect(grid!.cells.filter((c) => c.state === "open")).toEqual([]);
  });

  it("lets only one of two simultaneous bookings take a slot", async () => {
    const w = await world();
    const other = await makeLearner({ email: "max@home.test", schoolId: w.home.id, avail: [[2, 930]] });
    const results = await Promise.allSettled([
      book(w),
      createBooking(other.id, { tutorId: w.tutor.id, subjectId: w.algebra.id, startsAt: TUE_330, format: "online" }, NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.tutoringSession.count()).toBe(1);
  });

  it("marks the request matched, and rolls everything back if the Meet can't be created", async () => {
    const w = await world();
    const request = await db.helpRequest.create({
      data: { learnerId: w.learner.id, subjectId: w.algebra.id, description: "Factoring", expiresAt: new Date(NOW.getTime() + 86400000) },
    });

    const failing: MeetProvider = { ...fake, name: "fake", createMeeting: async () => { throw new Error("Google is down"); }, cancelMeeting: async () => {}, endMeeting: async () => {}, setAutoTranscribe: async () => {}, fetchTranscript: async () => ({ state: "none" }) };
    setMeetProvider(failing);
    await expect(book(w, { requestId: request.id })).rejects.toThrow(/couldn't create the Google Meet/);
    expect(await db.tutoringSession.count()).toBe(0);
    expect((await db.helpRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("open");

    setMeetProvider(fake);
    const { sessionId } = await book(w, { requestId: request.id });
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: sessionId } })).source).toBe("request");
    expect((await db.helpRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("matched");
  });
});
