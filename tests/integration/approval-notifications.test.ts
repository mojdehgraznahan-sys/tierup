import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { reminderDays, sendApprovalReminders } from "@/server/services/approval-notifications";
import { completeOnboarding, becomeStaff } from "@/server/services/onboarding";
import { decideConsent } from "@/server/services/consent";
import { addTutorSubject } from "@/server/services/profile";
import { approvalsQueue } from "@/server/services/moderation";
import { db, makeAccount, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

const DAY = 86400000;
beforeEach(async () => {
  sent.length = 0;
  await resetDb();
});
afterEach(() => {
  delete process.env.TUTOR_APPROVAL_REMINDER_DAYS;
});
afterAll(() => db.$disconnect());

async function newTutor() {
  const school = await makeSchool("Flint Hill School", ["flinthill.org"]);
  const [geometry, chemistry] = await makeSubjects("Geometry", "Chemistry");
  const account = await makeAccount("riya@gmail.test");
  await completeOnboarding(account.id, {
    role: "tutor",
    firstName: "Riya",
    lastName: "Shah",
    school: { kind: "listed", schoolId: school.id },
    grade: 12,
    subjectKeys: [geometry!.id, chemistry!.id],
    endorsements: {
      [geometry!.id]: { teacherEmail: "mr.new@flinthill.org", courseGrade: "A" },
      [chemistry!.id]: { teacherEmail: "mr.new@flinthill.org", courseGrade: "A−" },
    },
    blocks: ["lunch"],
    format: "both",
    parentEmail: "shah.parent@example.com",
    sendSummaries: true,
  });
  const consent = await db.parentConsent.findUniqueOrThrow({ where: { studentId: account.id } });
  return { school, account, consent };
}
const toTeacher = () => sent.filter((e) => e.to === "mr.new@flinthill.org");

describe("tutor approval emails", () => {
  it("sends one request per teacher listing subjects, grades and that consent is pending", async () => {
    await newTutor();
    const mail = toTeacher();
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toBe("Riya S. asked you to approve them as a tutor");
    expect(mail[0]!.text).toContain("• Chemistry: earned A−");
    expect(mail[0]!.text).toContain("• Geometry: earned A");
    expect(mail[0]!.text).toContain("Their parent hasn't given consent yet");
    expect(mail[0]!.text).toMatch(/\/approvals\?tutor=\w+/);
  });

  it("sends a single 'ready' email when the parent approves", async () => {
    const { consent } = await newTutor();
    sent.length = 0;
    await decideConsent(consent.token, "approved");
    await decideConsent(consent.token, "approved"); // double click
    const mail = toTeacher();
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toBe("Ready for your approval: Riya S., Chemistry, Geometry");
  });

  it("doesn't send 'ready' later for requests made after consent", async () => {
    const { account, consent } = await newTutor();
    await decideConsent(consent.token, "approved");
    const [bio] = await makeSubjects("Biology");
    sent.length = 0;
    await addTutorSubject(account.id, { subjectId: bio!.id, teacherEmail: "ms.bio@flinthill.org" });
    const mail = sent.filter((e) => e.to === "ms.bio@flinthill.org");
    expect(mail).toHaveLength(1);
    expect(mail[0]!.text).toContain("Their parent has given consent, so you can approve now.");
    expect((await db.tutorSubject.findFirstOrThrow({ where: { subjectId: bio!.id } })).readyNotifiedAt).not.toBeNull();
  });

  it("reminds once, N days after the request became approvable, and never for decided requests", async () => {
    const { account, consent } = await newTutor();
    await decideConsent(consent.token, "approved");
    const [geo] = await db.tutorSubject.findMany({ where: { tutorId: account.id }, orderBy: { createdAt: "asc" } });
    await db.tutorSubject.update({ where: { id: geo!.id }, data: { status: "approved" } });
    sent.length = 0;

    const now = Date.now();
    process.env.TUTOR_APPROVAL_REMINDER_DAYS = "3";
    expect(await sendApprovalReminders(new Date(now + 2 * DAY))).toEqual({ reminded: 0 });
    expect(await sendApprovalReminders(new Date(now + 3 * DAY + 60000))).toEqual({ reminded: 1 });
    expect(await sendApprovalReminders(new Date(now + 10 * DAY))).toEqual({ reminded: 0 });
    const mail = toTeacher();
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toBe("Reminder: Riya S. is waiting for your approval");
    expect(mail[0]!.text).not.toContain(geo!.subjectId);
  });

  it("reminder delay comes from TUTOR_APPROVAL_REMINDER_DAYS; 0 turns reminders off", async () => {
    expect(reminderDays({})).toBe(3);
    expect(reminderDays({ TUTOR_APPROVAL_REMINDER_DAYS: "5" })).toBe(5);
    expect(reminderDays({ TUTOR_APPROVAL_REMINDER_DAYS: "nonsense" })).toBe(3);
    expect(reminderDays({ TUTOR_APPROVAL_REMINDER_DAYS: "0" })).toBe(0);

    const { consent } = await newTutor();
    await decideConsent(consent.token, "approved");
    process.env.TUTOR_APPROVAL_REMINDER_DAYS = "0";
    expect(await sendApprovalReminders(new Date(Date.now() + 30 * DAY))).toEqual({ reminded: 0, disabled: true });
  });
});

describe("approvals tab: For me", () => {
  it("marks requests that named the teacher, by email before sign-up and by account after", async () => {
    const { school } = await newTutor();
    const [algebra] = await makeSubjects("Algebra II");
    await makeTutor({ email: "lena@flinthill.org", schoolId: school.id, subjects: { [algebra!.id]: "pending" } });

    const teacher = await makeAccount("mr.new@flinthill.org");
    await becomeStaff(teacher.id, { schoolId: school.id, displayName: "Mr. New" });
    const staff = await db.user.findUniqueOrThrow({ where: { id: teacher.id } });
    const rows = await approvalsQueue(staff);
    expect(rows.filter((r) => r.forMe).map((r) => r.subject).sort()).toEqual(["Chemistry", "Geometry"]);
    expect(rows.find((r) => r.subject === "Algebra II")!.forMe).toBe(false);
  });
});
