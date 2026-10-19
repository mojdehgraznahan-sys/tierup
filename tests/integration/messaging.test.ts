import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/email/send", () => ({ sendEmail: async () => {}, sendEmailSafely: async () => {} }));

import { listThreads, messagesSince, sendMessage, threadView, unreadCount } from "@/server/services/messaging";
import { getOrCreatePreBookingThread } from "@/server/services/threads";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

async function world() {
  const school = await makeSchool("Home High", ["home.test"]);
  const otherSchool = await makeSchool("Other High", ["other.test"]);
  const [algebra] = await makeSubjects("Algebra II");
  const learner = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: school.id });
  const tutor = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: school.id, subjects: { [algebra!.id]: "approved" } });
  const thread = await getOrCreatePreBookingThread(learner.id, { tutorId: tutor.id, subjectId: algebra!.id });
  const staff = await db.user.create({ data: { email: "ms.s@home.test", name: "Ms. Staff", roles: ["staff"], schoolId: school.id, onboardedAt: new Date() } });
  const outsiderStaff = await db.user.create({ data: { email: "mr.o@other.test", name: "Mr. Other", roles: ["staff"], schoolId: otherSchool.id, onboardedAt: new Date() } });
  const stranger = await makeLearner({ email: "sam@home.test", schoolId: school.id });
  return { learner, tutor, thread, staff, outsiderStaff, stranger };
}

describe("messaging", () => {
  it("lets both participants chat and tracks unread", async () => {
    const w = await world();
    await sendMessage(w.learner, w.thread.id, "Can we do problems 4–9?");
    expect(await unreadCount(w.tutor.id)).toBe(1);
    expect(await unreadCount(w.learner.id)).toBe(0);

    const tutorList = await listThreads(w.tutor);
    expect(tutorList[0]).toMatchObject({ otherName: "Lea L.", status: "Not booked", unread: true });

    const view = await threadView(w.tutor, w.thread.id);
    expect(view?.role).toBe("tutor");
    expect(view?.messages.map((m) => [m.body, m.mine])).toEqual([["Can we do problems 4–9?", false]]);
    expect(await unreadCount(w.tutor.id)).toBe(0);

    const before = new Date();
    await sendMessage(w.tutor, w.thread.id, "Yes, bring your notes");
    const fresh = await messagesSince(w.learner, w.thread.id, before);
    expect(fresh.map((m) => m.body)).toEqual(["Yes, bring your notes"]);
  });

  it("gives school staff read-only access and keeps everyone else out", async () => {
    const w = await world();
    await sendMessage(w.learner, w.thread.id, "Hello");
    expect((await threadView(w.staff, w.thread.id))?.role).toBe("staff");
    await expect(sendMessage(w.staff, w.thread.id, "Hi")).rejects.toThrow(/Staff can read/);

    expect(await threadView(w.outsiderStaff, w.thread.id)).toBeNull();
    expect(await threadView(w.stranger, w.thread.id)).toBeNull();
    await expect(sendMessage(w.stranger, w.thread.id, "Hi")).rejects.toThrow(/access/);
  });

  it("delivers but flags off-platform contact, with one auto-report per thread", async () => {
    const w = await world();
    const m = await sendMessage(w.tutor, w.thread.id, "just text me at 202-555-0143");
    expect(m.flagged).toBe(true);
    await sendMessage(w.tutor, w.thread.id, "or snapchat");
    const reports = await db.report.findMany({ where: { threadId: w.thread.id } });
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ automatic: true, againstUserId: w.tutor.id, messageId: m.id, status: "new" });
    expect(reports[0]!.reason).toMatch(/phone number/);
  });

  it("blocks paused tutors and rate-limits bursts", async () => {
    const w = await world();
    for (let i = 0; i < 20; i++) await sendMessage(w.learner, w.thread.id, `msg ${i}`);
    await expect(sendMessage(w.learner, w.thread.id, "one more")).rejects.toThrow(/too fast/);

    await db.tutorStatus.update({ where: { tutorId: w.tutor.id }, data: { paused: true } });
    await expect(sendMessage(w.tutor, w.thread.id, "hi")).rejects.toThrow(/paused/);
  });

  it("rejects empty and overlong messages", async () => {
    const w = await world();
    await expect(sendMessage(w.learner, w.thread.id, "   ")).rejects.toThrow();
    await expect(sendMessage(w.learner, w.thread.id, "x".repeat(2001))).rejects.toThrow();
  });
});

describe("thread ordering", () => {
  it("lists upcoming booked sessions first, then other chats by latest activity", async () => {
    const w = await world();
    const [bio] = await makeSubjects("Biology");
    await db.tutorSubject.create({ data: { tutorId: w.tutor.id, subjectId: bio!.id, status: "approved" } });
    const booked = await getOrCreatePreBookingThread(w.learner.id, { tutorId: w.tutor.id, subjectId: bio!.id });
    await db.tutoringSession.create({
      data: {
        threadId: booked.id, learnerId: w.learner.id, tutorId: w.tutor.id, subjectId: bio!.id,
        startsAt: new Date(Date.now() + 86400000), format: "online", status: "confirmed",
      },
    });
    await sendMessage(w.learner, w.thread.id, "newer message on the pre-booking chat");
    const list = await listThreads(w.learner);
    expect(list.map((t) => t.id)).toEqual([booked.id, w.thread.id]);
    expect(list[0]!.status).toBe("Confirmed");
  });
});
