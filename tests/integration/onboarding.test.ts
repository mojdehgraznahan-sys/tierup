import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { becomeStaff, completeOnboarding } from "@/server/services/onboarding";
import { decideConsent, resendConsent } from "@/server/services/consent";
import { hasParentConsent } from "@/server/policies/rules";
import type { OnboardingInput } from "@/lib/validation/onboarding";
import { customKey } from "@/lib/validation/onboarding";
import { db, makeAccount, makeSchool, makeSubjects, resetDb } from "./helpers";

beforeEach(async () => {
  sent.length = 0;
  await resetDb();
});
afterAll(() => db.$disconnect());

function input(overrides: Partial<OnboardingInput>): OnboardingInput {
  return {
    role: "learner",
    firstName: "Alex",
    lastName: "Park",
    school: { kind: "listed", schoolId: "" },
    grade: 10,
    schoolEmail: "",
    subjectKeys: [],
    endorsements: {},
    blocks: ["lunch"],
    format: "both",
    parentEmail: "parent@example.com",
    sendSummaries: true,
    ...overrides,
  };
}

describe("learner onboarding", () => {
  it("creates profile, subjects, availability and a pending parent consent", async () => {
    const school = await makeSchool();
    const [algebra] = await makeSubjects("Algebra II");
    const account = await makeAccount("alex@gmail.test");

    const result = await completeOnboarding(
      account.id,
      input({ school: { kind: "listed", schoolId: school.id }, subjectKeys: [algebra!.id, customKey("Robotics Club Math")], blocks: ["lunch", "evening"] }),
    );
    expect(result).toEqual({ redirectTo: "/home", toast: "Consent link sent to your parent" });

    const user = await db.user.findUniqueOrThrow({
      where: { id: account.id },
      include: { consent: true, learnerSubjects: { include: { subject: true } }, availability: { include: { slot: true } } },
    });
    expect(user.name).toBe("Alex Park");
    expect(user.roles).toEqual(["learner"]);
    expect(user.onboardedAt).not.toBeNull();
    expect(user.formats).toEqual(["in_person", "online"]);
    expect(user.learnerSubjects.map((s) => s.subject.name).sort()).toEqual(["Algebra II", "Robotics Club Math"]);
    // Lunch + 7:00 pm, Mon–Fri.
    expect(user.availability).toHaveLength(10);
    expect(new Set(user.availability.map((a) => a.slot.block))).toEqual(new Set(["lunch", "evening"]));
    expect(user.consent?.status).toBe("pending");
    expect(hasParentConsent(user)).toBe(false);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("parent@example.com");
    expect(sent[0]!.text).toContain(`/consent/${user.consent!.token}`);
  });

  it("puts unlisted schools on the waitlist", async () => {
    const [algebra] = await makeSubjects("Algebra II");
    const account = await makeAccount("sam@gmail.test");
    await completeOnboarding(account.id, input({ school: { kind: "unlisted", schoolName: "Hilltop Prep" }, subjectKeys: [algebra!.id] }));
    const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(user.schoolId).toBeNull();
    expect(await db.schoolWaitlist.findFirst({ where: { email: "sam@gmail.test" } })).toMatchObject({ kind: "student", schoolName: "Hilltop Prep" });
  });

  it("rejects the student's own email as the parent email, and a second onboarding", async () => {
    const school = await makeSchool();
    const [algebra] = await makeSubjects("Algebra II");
    const account = await makeAccount("alex@gmail.test");
    const base = input({ school: { kind: "listed", schoolId: school.id }, subjectKeys: [algebra!.id] });

    await expect(completeOnboarding(account.id, { ...base, parentEmail: "ALEX@gmail.test" })).rejects.toThrow(/parent's email/);
    await completeOnboarding(account.id, base);
    await expect(completeOnboarding(account.id, base)).rejects.toThrow(/already finished/);
  });
});

describe("tutor onboarding", () => {
  it("creates pending per-subject approvals with the typed teacher email and emails each teacher once", async () => {
    const school = await makeSchool();
    const [algebra, calc] = await makeSubjects("Algebra II", "Calculus");
    const account = await makeAccount("maya@gmail.test");

    const result = await completeOnboarding(
      account.id,
      input({
        role: "tutor",
        school: { kind: "listed", schoolId: school.id },
        subjectKeys: [algebra!.id, calc!.id],
        endorsements: {
          [algebra!.id]: { teacherEmail: "Ortiz@test-academy.test", courseGrade: "A" },
          [calc!.id]: { teacherEmail: "ortiz@test-academy.test" },
        },
      }),
    );
    expect(result.redirectTo).toBe("/dashboard");

    const subjects = await db.tutorSubject.findMany({ where: { tutorId: account.id } });
    expect(subjects).toHaveLength(2);
    expect(subjects.every((s) => s.status === "pending" && s.endorserEmail === "ortiz@test-academy.test")).toBe(true);
    expect(await db.tutorStatus.findUnique({ where: { tutorId: account.id } })).not.toBeNull();

    const teacherMail = sent.filter((e) => e.to === "ortiz@test-academy.test");
    expect(teacherMail).toHaveLength(1);
    expect(teacherMail[0]!.text).toContain("Algebra II, Calculus");
  });

  it("requires teacher emails on the school's staff domain", async () => {
    const school = await makeSchool();
    const [algebra] = await makeSubjects("Algebra II");
    const account = await makeAccount("maya@gmail.test");
    await expect(
      completeOnboarding(
        account.id,
        input({
          role: "tutor",
          school: { kind: "listed", schoolId: school.id },
          subjectKeys: [algebra!.id],
          endorsements: { [algebra!.id]: { teacherEmail: "ortiz@gmail.test" } },
        }),
      ),
    ).rejects.toThrow(/test-academy\.test/);
  });

  it("requires an endorsing teacher for every subject", async () => {
    const school = await makeSchool();
    const [algebra] = await makeSubjects("Algebra II");
    const account = await makeAccount("maya@gmail.test");
    await expect(
      completeOnboarding(account.id, input({ role: "tutor", school: { kind: "listed", schoolId: school.id }, subjectKeys: [algebra!.id] })),
    ).rejects.toThrow(/teacher's email/);
  });
});

describe("staff sign-up", () => {
  it("verifies the email domain, opens the school and links earlier endorsements", async () => {
    const school = await makeSchool();
    const [algebra] = await makeSubjects("Algebra II");
    const tutor = await makeAccount("maya@gmail.test");
    await completeOnboarding(
      tutor.id,
      input({
        role: "tutor",
        school: { kind: "listed", schoolId: school.id },
        subjectKeys: [algebra!.id],
        endorsements: { [algebra!.id]: { teacherEmail: "ortiz@test-academy.test" } },
      }),
    );

    const outsider = await makeAccount("ortiz@gmail.test");
    await expect(becomeStaff(outsider.id, { schoolId: school.id, displayName: "Ms. Ortiz" })).rejects.toThrow(/test-academy\.test/);

    const teacher = await makeAccount("ortiz@test-academy.test");
    expect(await becomeStaff(teacher.id, { schoolId: school.id, displayName: "Ms. Ortiz" })).toEqual({ status: "ok" });

    const staff = await db.user.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(staff).toMatchObject({ roles: ["staff"], schoolId: school.id, name: "Ms. Ortiz" });
    expect((await db.school.findUniqueOrThrow({ where: { id: school.id } })).active).toBe(true);
    expect((await db.tutorSubject.findFirstOrThrow({ where: { tutorId: tutor.id } })).endorserId).toBe(teacher.id);
  });

  it("waitlists teachers at schools without a verified domain", async () => {
    const school = await makeSchool("Unverified School", []);
    const teacher = await makeAccount("teach@unverified.test");
    expect(await becomeStaff(teacher.id, { schoolId: school.id, displayName: "Mr. Lee" })).toMatchObject({ status: "waitlisted" });
    expect((await db.user.findUniqueOrThrow({ where: { id: teacher.id } })).roles).toEqual([]);
    expect(await db.schoolWaitlist.count({ where: { kind: "staff", schoolId: school.id } })).toBe(1);
  });

  it("refuses to turn a student account into staff", async () => {
    const school = await makeSchool();
    const [algebra] = await makeSubjects("Algebra II");
    const student = await makeAccount("kid@test-academy.test");
    await completeOnboarding(student.id, input({ school: { kind: "listed", schoolId: school.id }, subjectKeys: [algebra!.id] }));
    await expect(becomeStaff(student.id, { schoolId: school.id, displayName: "Kid" })).rejects.toThrow(/student account/);
  });
});

describe("parent consent", () => {
  it("approves via token and rate-limits resends", async () => {
    const school = await makeSchool();
    const [algebra] = await makeSubjects("Algebra II");
    const account = await makeAccount("alex@gmail.test");
    await completeOnboarding(account.id, input({ school: { kind: "listed", schoolId: school.id }, subjectKeys: [algebra!.id] }));
    const consent = await db.parentConsent.findUniqueOrThrow({ where: { studentId: account.id } });

    await expect(resendConsent(account.id)).rejects.toThrow(/resend in/);
    await db.parentConsent.update({ where: { id: consent.id }, data: { lastSentAt: new Date(Date.now() - 11 * 60000) } });
    sent.length = 0;
    await resendConsent(account.id);
    expect(sent).toHaveLength(1);

    await expect(decideConsent("not-a-token", "approved")).rejects.toThrow(/isn't valid/);
    await decideConsent(consent.token, "approved");
    const user = await db.user.findUniqueOrThrow({ where: { id: account.id }, include: { consent: true } });
    expect(hasParentConsent(user)).toBe(true);
    await expect(resendConsent(account.id)).rejects.toThrow(/already approved/);
  });
});
