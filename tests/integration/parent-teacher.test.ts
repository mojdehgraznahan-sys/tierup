import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { setMeetProvider } from "@/server/integrations/meet";
import { FakeMeetProvider } from "@/server/integrations/meet/fake";
import { setSummarizer } from "@/server/integrations/summarizer";
import { FakeSummarizer } from "@/server/integrations/summarizer/fake";
import { createBooking } from "@/server/services/booking";
import { completeAndReview, saveTutorNotes, tutorWrapUp } from "@/server/services/lifecycle";
import { completeOnboarding } from "@/server/services/onboarding";
import { stopParentSummaries } from "@/server/services/parent-fyi";
import { updateLearnerClass, updateParentFyi } from "@/server/services/profile";
import { summarizeSessions } from "@/server/services/summaries";
import { digestStopSignature, sendTeacherDigests, stopTeacherDigest } from "@/server/services/teacher-digest";
import type { OnboardingInput } from "@/lib/validation/onboarding";
import { db, makeAccount, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

// Monday Oct 19 2026, 10:00 Eastern; sessions on Tue Oct 20 (3:30 pm) and Wed Oct 21 (3:30 pm).
const NOW = new Date("2026-10-19T14:00:00Z");
const TUE = "2026-10-20T19:30:00.000Z";
const AFTER_TUE = new Date("2026-10-20T20:30:00Z");
const MONDAY = new Date("2026-10-26T12:00:00Z");

beforeEach(async () => {
  vi.stubEnv("PARENT_CONSENT", "false");
  sent.length = 0;
  setMeetProvider(new FakeMeetProvider());
  setSummarizer(new FakeSummarizer());
  await resetDb();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  setSummarizer(undefined);
  await db.$disconnect();
});

function onboarding(over: Partial<OnboardingInput>): OnboardingInput {
  return { role: "learner", firstName: "Lea", lastName: "Learner", school: { kind: "listed", schoolId: "" }, grade: 10, schoolEmail: "", subjectKeys: [], endorsements: {}, blocks: ["lunch"], format: "both", ...over };
}

/** A session that happened, with tutor notes, wrapped up so it can be summarized. */
async function happened(learnerId: string, tutorId: string, subjectId: string, startsAt = TUE) {
  const { sessionId } = await createBooking(learnerId, { tutorId, subjectId, startsAt, format: "online" }, NOW);
  const after = new Date(new Date(startsAt).getTime() + 3600000);
  await saveTutorNotes(tutorId, sessionId, "Factoring trinomials", after);
  await tutorWrapUp(tutorId, sessionId, { learnerShowedUp: true }, after);
  return sessionId;
}

describe("class and teacher details", () => {
  it("are optional at onboarding, and the teacher must use a school staff email", async () => {
    const school = await makeSchool("Home High", ["home.test"]);
    const [algebra, bio] = await makeSubjects("Algebra II", "Biology");
    const account = await makeAccount("lea@gmail.test");
    const base = { school: { kind: "listed" as const, schoolId: school.id }, subjectKeys: [algebra!.id, bio!.id] };

    await expect(completeOnboarding(account.id, onboarding({ ...base, classes: { [algebra!.id]: { teacherEmail: "kim@gmail.test" } } }))).rejects.toThrow(/school email \(…@home.test\)/);
    await completeOnboarding(
      account.id,
      onboarding({ ...base, classes: { [algebra!.id]: { className: "Period 3", teacherName: "Mr. Kim", teacherEmail: "kim@home.test" } }, parentEmail: "mom@family.test" }),
    );
    const subjects = await db.learnerSubject.findMany({ where: { userId: account.id }, orderBy: { subjectId: "asc" } });
    expect(subjects.find((s) => s.subjectId === algebra!.id)).toMatchObject({ className: "Period 3", teacherName: "Mr. Kim", teacherEmail: "kim@home.test" });
    expect(subjects.find((s) => s.subjectId === bio!.id)).toMatchObject({ className: null, teacherEmail: null });
    const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(user.parentEmail).toBe("mom@family.test");
    expect(user.parentOptOutToken).toBeTruthy();
    expect(await db.parentConsent.count()).toBe(0); // consent is off: no consent request
  });

  it("can be edited in Settings", async () => {
    const school = await makeSchool("Home High", ["home.test"]);
    const [algebra] = await makeSubjects("Algebra II");
    const lea = await makeLearner({ email: "lea@home.test", schoolId: school.id });
    await db.learnerSubject.create({ data: { userId: lea.id, subjectId: algebra!.id } });
    await expect(updateLearnerClass(lea.id, algebra!.id, { teacherEmail: "lea@home.test" })).rejects.toThrow(/not your own/);
    expect((await updateLearnerClass(lea.id, algebra!.id, { className: "Period 3", teacherEmail: "kim@home.test" })).toast).toMatch(/weekly summary/);
    await expect(updateLearnerClass(lea.id, "not-mine", {})).rejects.toThrow(/Add this class first/);
  });
});

describe("parent FYI summaries", () => {
  async function world(parentEmail: string | null) {
    const school = await makeSchool("Home High", ["home.test"]);
    const [algebra] = await makeSubjects("Algebra II");
    const lea = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: school.id, avail: [[2, 930], [3, 930]] });
    const tom = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: school.id, subjects: { [algebra!.id]: "approved" }, avail: [[2, 930], [3, 930]] });
    if (parentEmail) await updateParentFyi(lea.id, { parentEmail, on: true });
    return { lea, tom, algebra: algebra! };
  }

  it("go to the parent with a working stop link, and stop when they click it", async () => {
    const w = await world("mom@family.test");
    await happened(w.lea.id, w.tom.id, w.algebra.id);
    sent.length = 0;
    await summarizeSessions(AFTER_TUE);
    const fyi = sent.find((e) => e.to === "mom@family.test")!;
    expect(fyi.subject).toBe("FYI: Lea L.'s Algebra II tutoring session");
    expect(fyi.text).toMatch(/Factoring trinomials/);
    const token = /parent-updates\/([\w-]+)/.exec(fyi.text)![1]!;

    expect(await stopParentSummaries(token)).toBe(true);
    expect(await stopParentSummaries("not-a-token")).toBe(false);
    await happened(w.lea.id, w.tom.id, w.algebra.id, "2026-10-21T19:30:00.000Z");
    sent.length = 0;
    await summarizeSessions(new Date("2026-10-21T20:30:00Z"));
    expect(sent.map((e) => e.to).sort()).toEqual(["lea@home.test", "tom@home.test"]);
  });

  it("are skipped without a parent email", async () => {
    const w = await world(null);
    await happened(w.lea.id, w.tom.id, w.algebra.id);
    sent.length = 0;
    await summarizeSessions(AFTER_TUE);
    expect(sent.map((e) => e.to).sort()).toEqual(["lea@home.test", "tom@home.test"]);
  });

  it("use the consent parent while parent consent is on, replacing the notes-only summary", async () => {
    vi.stubEnv("PARENT_CONSENT", "true");
    const w = await world(null);
    const sessionId = await happened(w.lea.id, w.tom.id, w.algebra.id);
    sent.length = 0;
    await completeAndReview(w.lea.id, sessionId, { happened: "yes", stars: 5 }, AFTER_TUE);
    expect(sent.map((e) => e.to)).toEqual(["tom@home.test"]); // no notes-only summary to the parent
    sent.length = 0;
    await summarizeSessions(AFTER_TUE);
    expect(sent.map((e) => e.to)).toContain("parent+lea@home.test");
  });
});

describe("weekly teacher digest", () => {
  it("sends each teacher one email with their students' sessions, once", async () => {
    const school = await makeSchool("Home High", ["home.test"]);
    const [algebra] = await makeSubjects("Algebra II");
    const tom = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: school.id, subjects: { [algebra!.id]: "approved" }, avail: [[2, 930], [3, 930]] });
    const lea = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: school.id, avail: [[2, 930]] });
    const max = await makeLearner({ email: "max@home.test", name: "Max Mills", schoolId: school.id, avail: [[3, 930]] });
    const noTeacher = await makeLearner({ email: "nat@home.test", name: "Nat Nobody", schoolId: school.id, avail: [[2, 930]] });
    for (const u of [lea, max, noTeacher]) await db.learnerSubject.create({ data: { userId: u.id, subjectId: algebra!.id } });
    await updateLearnerClass(lea.id, algebra!.id, { className: "Period 3", teacherName: "Mr. Kim", teacherEmail: "kim@home.test" });
    await updateLearnerClass(max.id, algebra!.id, { teacherName: "Mr. Kim", teacherEmail: "KIM@home.test" });

    await happened(lea.id, tom.id, algebra!.id);
    await happened(max.id, tom.id, algebra!.id, "2026-10-21T19:30:00.000Z");
    await summarizeSessions(new Date("2026-10-22T12:00:00Z"));
    sent.length = 0;

    expect(await sendTeacherDigests(MONDAY)).toEqual({ teachers: 1, sessions: 2 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("kim@home.test");
    expect(sent[0]!.text).toMatch(/Hi Mr. Kim/);
    expect(sent[0]!.text).toMatch(/Lea L\. · Algebra II, Period 3 · with Tom T\./);
    expect(sent[0]!.text).toMatch(/Max M\./);

    // Next week: a session by a learner who named no teacher is summarized but goes to nobody.
    await happened(noTeacher.id, tom.id, algebra!.id, "2026-10-27T19:30:00.000Z");
    sent.length = 0;
    expect(await summarizeSessions(new Date("2026-10-28T12:00:00Z"))).toEqual({ done: 1 });
    sent.length = 0;
    expect(await sendTeacherDigests(new Date("2026-11-02T12:00:00Z"))).toEqual({ teachers: 0, sessions: 0 });
    expect(sent).toHaveLength(0);
  });

  it("respects a teacher's opt-out, from a correctly signed link only", async () => {
    expect(await stopTeacherDigest("kim@home.test", "forged")).toBe(false);
    expect(await stopTeacherDigest("kim@home.test", digestStopSignature("KIM@home.test"))).toBe(true);
    expect(await db.digestOptOut.findUnique({ where: { email: "kim@home.test" } })).not.toBeNull();

    const school = await makeSchool("Home High", ["home.test"]);
    const [algebra] = await makeSubjects("Algebra II");
    const tom = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: school.id, subjects: { [algebra!.id]: "approved" }, avail: [[2, 930]] });
    const lea = await makeLearner({ email: "lea@home.test", name: "Lea Learner", schoolId: school.id, avail: [[2, 930]] });
    await db.learnerSubject.create({ data: { userId: lea.id, subjectId: algebra!.id, teacherEmail: "kim@home.test" } });
    await happened(lea.id, tom.id, algebra!.id);
    await summarizeSessions(AFTER_TUE);
    sent.length = 0;
    expect(await sendTeacherDigests(MONDAY)).toEqual({ teachers: 0, sessions: 0 });
    expect(sent).toHaveLength(0);
  });
});
