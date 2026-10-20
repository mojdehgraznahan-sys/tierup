import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/email/send", () => ({ sendEmail: async () => {}, sendEmailSafely: async () => {} }));

import { hoursExport, logHours, schoolYear, tutorHours, unlogHours } from "@/server/services/hours";
import { hoursCsv, hoursPdf } from "@/server/services/hours-export";
import { createRequest, passRequest, respondToRequest, tutorInbox } from "@/server/services/requests";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const NOW = new Date("2026-10-19T14:00:00Z");

async function world() {
  const school = await makeSchool("Home High", ["home.test"]);
  await db.school.update({ where: { id: school.id }, data: { serviceHourGoal: 30 } });
  const [algebra, bio] = await makeSubjects("Algebra II", "Biology");
  const learner = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: school.id });
  const tutor = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: school.id, subjects: { [algebra!.id]: "approved" } });
  let n = 0;
  const session = async (startsAt: string, status: "confirmed" | "completed" | "no_show" | "cancelled", durationMin = 45, confirmed = false) => {
    const thread = await db.thread.create({ data: { learnerId: learner.id, tutorId: tutor.id, subjectId: algebra!.id } });
    n++;
    return db.tutoringSession.create({
      data: {
        threadId: thread.id, learnerId: learner.id, tutorId: tutor.id, subjectId: algebra!.id,
        startsAt: new Date(startsAt), durationMin, format: "online", status,
        learnerConfirmedAt: confirmed ? new Date(startsAt) : null, meetUrl: `https://meet.google.com/x-${n}`,
      },
    });
  };
  return { school, algebra: algebra!, bio: bio!, learner, tutor, session };
}

describe("school year", () => {
  it("runs Aug 1 – Jul 31", () => {
    expect(schoolYear(new Date("2026-10-19T14:00:00Z")).label).toBe("2026–27");
    expect(schoolYear(new Date("2027-03-01T14:00:00Z")).label).toBe("2026–27");
    expect(schoolYear(new Date("2026-07-31T14:00:00Z")).label).toBe("2025–26");
  });
});

describe("logging hours", () => {
  it("lists only finished, real sessions this school year and totals approved/pending", async () => {
    const w = await world();
    const done = await w.session("2026-10-13T19:30:00Z", "completed", 45, true);
    const endedUnreviewed = await w.session("2026-10-15T19:30:00Z", "confirmed", 60);
    await w.session("2026-10-20T19:30:00Z", "confirmed"); // future
    await w.session("2026-10-14T19:30:00Z", "no_show");
    await w.session("2026-10-16T19:30:00Z", "cancelled");
    await w.session("2026-06-01T19:30:00Z", "completed"); // last school year
    const approved = await w.session("2026-09-10T19:30:00Z", "completed", 60, true);
    await db.hourLog.create({ data: { sessionId: approved.id, tutorId: w.tutor.id, hours: 1, status: "approved" } });

    const before = await tutorHours(w.tutor.id, NOW);
    expect(before.rows.map((r) => r.sessionId)).toEqual([endedUnreviewed.id, done.id, approved.id]);
    expect(before).toMatchObject({ approved: 1, pending: 0, goal: 30, yearLabel: "2026–27" });

    expect((await logHours(w.tutor.id, done.id, NOW)).toast).toBe("0.75h sent to your teacher for sign-off");
    await logHours(w.tutor.id, endedUnreviewed.id, NOW);
    const after = await tutorHours(w.tutor.id, NOW);
    expect(after.pending).toBe(1.75);
    expect(after.rows.find((r) => r.sessionId === done.id)).toMatchObject({ status: "logged", hours: 0.75, learnerConfirmed: true });

    expect((await unlogHours(w.tutor.id, done.id, NOW)).toast).toBe("0.75h removed from your log");
    expect((await tutorHours(w.tutor.id, NOW)).pending).toBe(1);
  });

  it("locks approved and rejected logs, and refuses other tutors' or future sessions", async () => {
    const w = await world();
    const approved = await w.session("2026-10-13T19:30:00Z", "completed", 45, true);
    await db.hourLog.create({ data: { sessionId: approved.id, tutorId: w.tutor.id, hours: 0.75, status: "approved" } });
    await expect(unlogHours(w.tutor.id, approved.id, NOW)).rejects.toThrow(/Already approved/);
    await expect(logHours(w.tutor.id, approved.id, NOW)).rejects.toThrow(/Already approved/);

    const future = await w.session("2026-10-20T19:30:00Z", "confirmed");
    await expect(logHours(w.tutor.id, future.id, NOW)).rejects.toThrow(/after they're over/);
    const noShow = await w.session("2026-10-14T19:30:00Z", "no_show");
    await expect(logHours(w.tutor.id, noShow.id, NOW)).rejects.toThrow(/after they're over/);
    const other = await makeTutor({ email: "oz@home.test", schoolId: w.school.id, subjects: { [w.algebra.id]: "approved" } });
    const done = await w.session("2026-10-12T19:30:00Z", "completed");
    await expect(logHours(other.id, done.id, NOW)).rejects.toThrow(/your own sessions/);
  });
});

describe("export", () => {
  it("produces a CSV (with formula-safe cells) and a PDF", async () => {
    const w = await world();
    await db.user.update({ where: { id: w.learner.id }, data: { name: "=cmd Hacker" } });
    const done = await w.session("2026-10-13T19:30:00Z", "completed", 45, true);
    await logHours(w.tutor.id, done.id, NOW);
    const data = await hoursExport(w.tutor.id, NOW);
    expect(data.rows).toHaveLength(1);

    const csv = hoursCsv(data);
    expect(csv.split("\r\n")[0]).toBe("Date,Subject,Learner,Hours,Status,Learner confirmed,Signed off by,Signed off on");
    expect(csv).toContain("2026-10-13,Algebra II,'=cmd H.,0.75,Waiting for sign-off,Yes,,");

    const pdf = await hoursPdf(data);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("tutor inbox", () => {
  it("shows open requests in approved subjects until replied to or passed", async () => {
    const w = await world();
    const { request: a } = await createRequest(w.learner.id, { subjectId: w.algebra.id, description: "Factoring help" });
    const { request: b } = await createRequest(w.learner.id, { subjectId: w.algebra.id, description: "Quadratic formula" });
    await createRequest(w.learner.id, { subjectId: w.bio.id, description: "Cell respiration" }); // not approved in Biology

    let inbox = await tutorInbox(w.tutor.id);
    expect(inbox.eligible).toBe(true);
    expect(inbox.requests.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(inbox.requests[0]).toMatchObject({ learnerLabel: "Lea L. (10th)", formatText: "In person or online" });

    await respondToRequest(w.tutor.id, a.id, "I can do Tue lunch");
    await passRequest(w.tutor.id, b.id);
    inbox = await tutorInbox(w.tutor.id);
    expect(inbox.requests).toEqual([]);
  });

  it("is empty and ineligible for tutors without consent", async () => {
    const w = await world();
    await db.parentConsent.update({ where: { studentId: w.tutor.id }, data: { status: "pending" } });
    await createRequest(w.learner.id, { subjectId: w.algebra.id, description: "Factoring help" });
    expect(await tutorInbox(w.tutor.id)).toEqual({ eligible: false, requests: [] });
  });
});
