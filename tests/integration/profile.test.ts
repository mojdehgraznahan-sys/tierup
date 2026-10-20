import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import * as p from "@/server/services/profile";
import { hasParentConsent } from "@/server/policies/rules";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

beforeEach(async () => {
  sent.length = 0;
  await resetDb();
});
afterAll(() => db.$disconnect());

async function world() {
  const school = await makeSchool("Home High", ["home.test"]);
  const other = await makeSchool("Other High", ["other.test"]);
  const [algebra, bio] = await makeSubjects("Algebra II", "Biology");
  const learner = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: school.id });
  const tutor = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: school.id, subjects: { [algebra!.id]: "approved" } });
  const slots = await db.schoolSlot.findMany({ where: { schoolId: school.id }, orderBy: { sortOrder: "asc" } });
  const otherSlots = await db.schoolSlot.findMany({ where: { schoolId: other.id } });
  return { school, algebra: algebra!, bio: bio!, learner, tutor, slots, otherSlots };
}

describe("about you", () => {
  it("updates name, grade, school email and formats", async () => {
    const w = await world();
    await p.updateBasics(w.learner.id, { firstName: "Leah", lastName: "Lopez", grade: 11, schoolEmail: "", format: "online" });
    expect(await db.user.findUniqueOrThrow({ where: { id: w.learner.id } })).toMatchObject({ name: "Leah Lopez", grade: 11, schoolEmail: null, formats: ["online"] });
  });
});

describe("bio", () => {
  it("saves a tutor bio and rejects contact info", async () => {
    const w = await world();
    await p.updateBio(w.tutor.id, "I explain factoring with your own homework.");
    expect((await db.user.findUniqueOrThrow({ where: { id: w.tutor.id } })).bio).toBe("I explain factoring with your own homework.");
    await expect(p.updateBio(w.tutor.id, "Text me at 202-555-0143")).rejects.toThrow(/can't include a phone number/);
    await expect(p.updateBio(w.learner.id, "hi")).rejects.toThrow(/Only tutors/);
  });
});

describe("availability", () => {
  it("replaces free times with slots from the user's own school only", async () => {
    const w = await world();
    const lunch = w.slots.find((s) => s.label === "Lunch")!;
    const after = w.slots.find((s) => s.label === "3:30 pm")!;
    expect((await p.setAvailability(w.learner.id, [`2:${lunch.id}`, `4:${after.id}`, `2:${lunch.id}`])).toast).toBe("Saved 2 free times");
    const rows = await db.availabilitySlot.findMany({ where: { userId: w.learner.id }, orderBy: { weekday: "asc" } });
    expect(rows.map((r) => [r.weekday, r.slotId])).toEqual([[2, lunch.id], [4, after.id]]);

    await expect(p.setAvailability(w.learner.id, [`1:${w.otherSlots[0]!.id}`])).rejects.toThrow(/school's timetable/);
    await expect(p.setAvailability(w.learner.id, [`6:${lunch.id}`])).rejects.toThrow();
    await p.setAvailability(w.learner.id, []);
    expect(await db.availabilitySlot.count({ where: { userId: w.learner.id } })).toBe(0);
  });
});

describe("subjects", () => {
  it("adds and removes learner classes, including custom ones", async () => {
    const w = await world();
    await p.addLearnerSubject(w.learner.id, { subjectId: w.bio.id });
    await p.addLearnerSubject(w.learner.id, { customName: "  SAT   Math " });
    const names = (await db.learnerSubject.findMany({ where: { userId: w.learner.id }, include: { subject: true } })).map((l) => l.subject.name).sort();
    expect(names).toEqual(["Biology", "SAT Math"]);
    await p.removeLearnerSubject(w.learner.id, w.bio.id);
    expect(await db.learnerSubject.count({ where: { userId: w.learner.id } })).toBe(1);
  });

  it("adds a tutor subject as a pending request to a teacher on the school's domain", async () => {
    const w = await world();
    await expect(p.addTutorSubject(w.tutor.id, { subjectId: w.bio.id, teacherEmail: "t@gmail.test" })).rejects.toThrow(/home\.test/);
    await expect(p.addTutorSubject(w.tutor.id, { subjectId: w.algebra.id, teacherEmail: "ms.a@home.test" })).rejects.toThrow(/already asked/);

    const { toast } = await p.addTutorSubject(w.tutor.id, { subjectId: w.bio.id, teacherEmail: "Ms.B@home.test", courseGrade: "A" });
    expect(toast).toBe("Approval request for Biology sent to your teacher");
    expect(await db.tutorSubject.findFirstOrThrow({ where: { tutorId: w.tutor.id, subjectId: w.bio.id } })).toMatchObject({
      status: "pending",
      endorserEmail: "ms.b@home.test",
      courseGrade: "A",
    });
    expect(sent.map((e) => e.to)).toEqual(["ms.b@home.test"]);

    // A revoked subject can be requested again; it goes back to pending.
    const ts = await db.tutorSubject.findFirstOrThrow({ where: { tutorId: w.tutor.id, subjectId: w.algebra.id } });
    await db.tutorSubject.update({ where: { id: ts.id }, data: { status: "revoked" } });
    await p.addTutorSubject(w.tutor.id, { subjectId: w.algebra.id, teacherEmail: "ms.a@home.test" });
    expect((await db.tutorSubject.findUniqueOrThrow({ where: { id: ts.id } })).status).toBe("pending");

    await p.removeTutorSubject(w.tutor.id, ts.id);
    await expect(p.removeTutorSubject(w.learner.id, ts.id)).rejects.toThrow(/isn't on your list/);
  });
});

describe("parent contact", () => {
  it("changes summaries in place, but a new email needs fresh consent", async () => {
    const w = await world();
    const before = await db.parentConsent.findUniqueOrThrow({ where: { studentId: w.learner.id } });

    expect(await p.updateParent(w.learner.id, { parentEmail: before.parentEmail, sendSummaries: false })).toMatchObject({ reconsent: false });
    expect(await db.parentConsent.findUniqueOrThrow({ where: { studentId: w.learner.id } })).toMatchObject({ status: "approved", sendSummaries: false });

    await expect(p.updateParent(w.learner.id, { parentEmail: "lea@home.test", sendSummaries: true })).rejects.toThrow(/not your own/);

    expect(await p.updateParent(w.learner.id, { parentEmail: "new.parent@example.com", sendSummaries: true })).toMatchObject({ reconsent: true });
    const after = await db.parentConsent.findUniqueOrThrow({ where: { studentId: w.learner.id } });
    expect(after).toMatchObject({ parentEmail: "new.parent@example.com", status: "pending" });
    expect(after.token).not.toBe(before.token);
    expect(sent.at(-1)!.to).toBe("new.parent@example.com");
    const user = await db.user.findUniqueOrThrow({ where: { id: w.learner.id }, include: { consent: true } });
    expect(hasParentConsent(user)).toBe(false);
  });
});
