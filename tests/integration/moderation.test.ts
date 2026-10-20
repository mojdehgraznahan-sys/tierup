import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { setMeetProvider } from "@/server/integrations/meet";
import { FakeMeetProvider } from "@/server/integrations/meet/fake";
import { browseTutors } from "@/server/services/discovery";
import { tutorHours } from "@/server/services/hours";
import * as m from "@/server/services/moderation";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

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
  const away = await makeSchool("Away High", ["away.test"]);
  const [algebra] = await makeSubjects("Algebra II");
  const staff = await db.user.create({ data: { email: "ms.s@home.test", name: "Ms. Staff", roles: ["staff"], schoolId: home.id, onboardedAt: new Date() } });
  const outsider = await db.user.create({ data: { email: "mr.o@away.test", name: "Mr. Other", roles: ["staff"], schoolId: away.id, onboardedAt: new Date() } });
  const learner = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: home.id });
  const tutor = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: home.id, subjects: { [algebra!.id]: "approved" } });
  const session = async (startsAt: Date, status: "confirmed" | "completed", confirmed = false) => {
    const thread = await db.thread.create({ data: { learnerId: learner.id, tutorId: tutor.id, subjectId: algebra!.id } });
    return db.tutoringSession.create({
      data: {
        threadId: thread.id, learnerId: learner.id, tutorId: tutor.id, subjectId: algebra!.id, startsAt, format: "online", status,
        learnerConfirmedAt: confirmed ? startsAt : null, meetUrl: `https://meet.google.com/${thread.id}`, calendarEventId: `evt-${thread.id}`,
      },
    });
  };
  return { home, away, algebra: algebra!, staff, outsider, learner, tutor, session };
}

describe("tutor approvals", () => {
  it("requires parent consent, and revoking hides the tutor", async () => {
    const w = await world();
    const pendingTutor = await makeTutor({ email: "pat@home.test", name: "Pat Pending", schoolId: w.home.id, consent: "pending", subjects: { [w.algebra.id]: "pending" } });
    const ts = await db.tutorSubject.findFirstOrThrow({ where: { tutorId: pendingTutor.id } });
    await expect(m.approveTutorSubject(w.staff, ts.id)).rejects.toThrow(/parent has consented/);

    await db.parentConsent.update({ where: { studentId: pendingTutor.id }, data: { status: "approved" } });
    expect((await m.approveTutorSubject(w.staff, ts.id)).toast).toBe("Pat P. approved for Algebra II");
    expect(await db.tutorSubject.findUniqueOrThrow({ where: { id: ts.id } })).toMatchObject({ status: "approved", decidedById: w.staff.id });
    expect(sent.at(-1)!.to).toBe("pat@home.test");

    const viewer = { id: w.learner.id, schoolId: w.home.id };
    expect((await browseTutors(viewer, { inPerson: true, online: true, sameSchoolOnly: false })).map((t) => t.id)).toContain(pendingTutor.id);
    await m.revokeTutorSubject(w.staff, ts.id);
    expect((await browseTutors(viewer, { inPerson: true, online: true, sameSchoolOnly: false })).map((t) => t.id)).not.toContain(pendingTutor.id);
  });

  it("only shows and acts on the staff member's own school", async () => {
    const w = await world();
    const ts = await db.tutorSubject.findFirstOrThrow({ where: { tutorId: w.tutor.id } });
    expect(await m.approvalsQueue(w.outsider)).toEqual([]);
    await expect(m.revokeTutorSubject(w.outsider, ts.id)).rejects.toThrow(/isn't at your school/);
    await expect(m.approvalsQueue({ ...w.learner, roles: ["learner"] })).rejects.toThrow(/Staff only/);
  });
});

describe("service hours", () => {
  it("approves and rejects single rows, and 'approve all' covers only learner-confirmed sessions", async () => {
    const w = await world();
    const now = new Date();
    const day = 86400000;
    const a = await w.session(new Date(now.getTime() - 3 * day), "completed", true);
    const b = await w.session(new Date(now.getTime() - 4 * day), "completed", true);
    const c = await w.session(new Date(now.getTime() - 5 * day), "completed", false);
    const d = await w.session(new Date(now.getTime() - 6 * day), "completed", true);
    const log = (sessionId: string) => db.hourLog.create({ data: { sessionId, tutorId: w.tutor.id, hours: 0.75 } });
    const [la, lb, lc, ld] = [await log(a.id), await log(b.id), await log(c.id), await log(d.id)];

    let q = await m.hoursQueue(w.staff);
    expect(q).toMatchObject({ waitingCount: 4, waitingHours: 3, confirmedCount: 3 });
    expect(await m.hoursQueue(w.outsider)).toMatchObject({ waitingCount: 0, rows: [] });
    await expect(m.approveHours(w.outsider, la.id)).rejects.toThrow(/aren't at your school/);

    expect((await m.rejectHours(w.staff, ld.id)).toast).toBe("Hours rejected. Tom T. has been notified.");
    expect((await m.approveHours(w.staff, la.id)).toast).toBe("0.75h approved for Tom T.");
    await expect(m.approveHours(w.staff, la.id)).rejects.toThrow(/already decided/);
    expect((await m.approveAllConfirmed(w.staff)).toast).toBe("1 entry approved"); // b only; c isn't confirmed

    const statuses = Object.fromEntries((await db.hourLog.findMany()).map((l) => [l.id, l.status]));
    expect(statuses).toEqual({ [la.id]: "approved", [lb.id]: "approved", [lc.id]: "logged", [ld.id]: "rejected" });
    expect((await tutorHours(w.tutor.id)).approved).toBe(1.5);
    q = await m.hoursQueue(w.staff);
    expect(q).toMatchObject({ waitingCount: 1, confirmedCount: 0 });
  });
});

describe("reports", () => {
  it("pausing a tutor hides them, cancels future sessions with their Meets, and notifies", async () => {
    const w = await world();
    const future = await w.session(new Date(Date.now() + 2 * 86400000), "confirmed");
    const past = await w.session(new Date(Date.now() - 2 * 86400000), "completed", true);
    const report = await db.report.create({ data: { reporterId: w.learner.id, againstUserId: w.tutor.id, reason: "Made me uncomfortable" } });

    expect(await m.reportsQueue(w.outsider)).toEqual([]);
    await expect(m.pauseReportedTutor(w.outsider, report.id)).rejects.toThrow(/isn't at your school/);

    const { toast } = await m.pauseReportedTutor(w.staff, report.id);
    expect(toast).toBe("Tom T. is paused from tutoring; 1 session cancelled");
    expect((await db.tutorStatus.findUniqueOrThrow({ where: { tutorId: w.tutor.id } })).paused).toBe(true);
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: future.id } })).status).toBe("cancelled");
    expect((await db.tutoringSession.findUniqueOrThrow({ where: { id: past.id } })).status).toBe("completed");
    expect(fake.cancelled).toEqual([future.calendarEventId]);
    expect(sent.map((e) => e.to).sort()).toEqual(["lea@home.test", "parent+lea@home.test", "tom@home.test"]);
    expect(await browseTutors({ id: w.learner.id, schoolId: w.home.id }, { inPerson: true, online: true, sameSchoolOnly: false })).toEqual([]);

    const [row] = await m.reportsQueue(w.staff);
    expect(row).toMatchObject({ status: "paused", againstPaused: true, actions: ["paused"], filedBy: "learner Lea L.", against: "Tom T." });

    await m.unpauseTutor(w.staff, report.id);
    expect((await db.tutorStatus.findUniqueOrThrow({ where: { tutorId: w.tutor.id } })).paused).toBe(false);
  });

  it("warns, notifies both families, dismisses, and shows the flagged chat line", async () => {
    const w = await world();
    const thread = await db.thread.create({ data: { learnerId: w.learner.id, tutorId: w.tutor.id, subjectId: w.algebra.id } });
    await db.message.create({ data: { threadId: thread.id, senderId: w.tutor.id, body: "ok see you thursday", createdAt: new Date(Date.now() - 60000) } });
    const flagged = await db.message.create({ data: { threadId: thread.id, senderId: w.tutor.id, body: "just text me instead", flagged: true } });
    const report = await db.report.create({ data: { automatic: true, againstUserId: w.tutor.id, threadId: thread.id, messageId: flagged.id, reason: "Possible off-platform contact (auto-flagged: request to talk elsewhere)" } });

    const [row] = await m.reportsQueue(w.staff);
    expect(row!.title).toBe("off-platform contact");
    expect(row!.filedBy).toBe("TierUp's automatic filter");
    expect(row!.excerpt.map((e) => [e.body, e.flagged])).toEqual([["ok see you thursday", false], ["just text me instead", true]]);

    expect((await m.warnReported(w.staff, report.id)).toast).toBe("Warning sent to Tom T.");
    expect(sent.at(-1)!.to).toBe("tom@home.test");
    sent.length = 0;
    expect((await m.notifyParents(w.staff, report.id)).toast).toBe("Family notified"); // no reporter: just the tutor's family
    expect(sent.map((e) => e.to)).toEqual(["parent+tom@home.test"]);
    await m.dismissReport(w.staff, report.id);
    expect(await db.report.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({ status: "dismissed", actions: ["warned", "notified_parents", "dismissed"] });
  });
});

describe("session log", () => {
  it("lists booked sessions at the school, not pre-booking chats or other schools", async () => {
    const w = await world();
    await db.thread.create({ data: { learnerId: w.learner.id, tutorId: w.tutor.id, subjectId: w.algebra.id } }); // pre-booking
    const s = await w.session(new Date(Date.now() + 86400000), "confirmed");
    const log = await m.sessionLog(w.staff);
    expect(log.map((r) => r.id)).toEqual([s.id]);
    expect(log[0]).toMatchObject({ tutor: "Tom T.", learner: "Lea L.", format: "Online", status: "Confirmed" });
    expect(await m.sessionLog(w.outsider)).toEqual([]);
  });
});
