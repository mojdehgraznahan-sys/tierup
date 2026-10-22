import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { setMeetProvider } from "@/server/integrations/meet";
import { FakeMeetProvider } from "@/server/integrations/meet/fake";
import { completeOnboarding } from "@/server/services/onboarding";
import { createBooking } from "@/server/services/booking";
import { browseTutors } from "@/server/services/discovery";
import { approveTutorSubject, notifyParents } from "@/server/services/moderation";
import { hasParentConsent } from "@/server/policies/rules";
import { db, makeAccount, makeSchool, makeSubjects, resetDb } from "./helpers";

// The app's current default: parent consent switched off; only teacher approval gates tutoring.
beforeAll(() => {
  process.env.PARENT_CONSENT = "false";
});
afterAll(async () => {
  process.env.PARENT_CONSENT = "true";
  await db.$disconnect();
});
beforeEach(async () => {
  sent.length = 0;
  setMeetProvider(new FakeMeetProvider());
  await resetDb();
});

const base = {
  firstName: "Alex",
  lastName: "Park",
  grade: 10,
  blocks: ["after_school" as const],
  format: "both" as const,
};

async function world() {
  const school = await makeSchool("Flint Hill School", ["flinthill.org"]);
  const [algebra] = await makeSubjects("Algebra II");
  const staff = await db.user.create({ data: { email: "ms.o@flinthill.org", name: "Ms. O", roles: ["staff"], schoolId: school.id, onboardedAt: new Date() } });
  return { school, algebra: algebra!, staff };
}

describe("parent consent switched off", () => {
  it("onboards a learner without a parent email or consent record", async () => {
    const w = await world();
    const a = await makeAccount("alex@gmail.test");
    const r = await completeOnboarding(a.id, { ...base, role: "learner", school: { kind: "listed", schoolId: w.school.id }, subjectKeys: [w.algebra.id] });
    expect(r.toast).toBe("You're all set");
    expect(await db.parentConsent.count()).toBe(0);
    expect(sent).toEqual([]);
    const user = await db.user.findUniqueOrThrow({ where: { id: a.id }, include: { consent: true } });
    expect(hasParentConsent(user)).toBe(true);
  });

  it("tutor → teacher approves right away → discoverable → bookable, with no parent emails", async () => {
    const w = await world();
    const t = await makeAccount("riya@gmail.test");
    await completeOnboarding(t.id, {
      ...base,
      firstName: "Riya",
      role: "tutor",
      school: { kind: "listed", schoolId: w.school.id },
      subjectKeys: [w.algebra.id],
      endorsements: { [w.algebra.id]: { teacherEmail: "ms.o@flinthill.org" } },
    });
    const request = sent.find((e) => e.to === "ms.o@flinthill.org")!;
    expect(request.text).toContain("You can review and approve it now.");
    expect(request.text).not.toMatch(/parent/i);
    const ts = await db.tutorSubject.findFirstOrThrow({ where: { tutorId: t.id } });
    expect(ts.readyNotifiedAt).not.toBeNull(); // counts as approvable now, so reminders can follow

    await approveTutorSubject(w.staff, ts.id);
    const learner = await makeAccount("alex@gmail.test");
    await completeOnboarding(learner.id, { ...base, role: "learner", school: { kind: "listed", schoolId: w.school.id }, subjectKeys: [w.algebra.id] });
    const found = await browseTutors({ id: learner.id, schoolId: w.school.id }, { inPerson: true, online: true, sameSchoolOnly: false });
    expect(found.map((x) => x.id)).toEqual([t.id]);

    // Both are free after school every weekday (onboarding's "after school" block).
    const now = new Date("2026-10-19T14:00:00Z"); // Mon 10:00 ET
    const startsAt = new Date("2026-10-20T19:30:00.000Z"); // Tue 3:30 pm ET
    sent.length = 0;
    await createBooking(learner.id, { tutorId: t.id, subjectId: w.algebra.id, startsAt: startsAt.toISOString(), format: "online" }, now);
    expect(sent.map((e) => e.to).sort()).toEqual(["alex@gmail.test", "riya@gmail.test"]);
  });

  it("has no parent actions for staff", async () => {
    const w = await world();
    const report = await db.report.create({ data: { reason: "Test" } });
    await expect(notifyParents(w.staff, report.id)).rejects.toThrow(/aren't collected/);
  });
});
