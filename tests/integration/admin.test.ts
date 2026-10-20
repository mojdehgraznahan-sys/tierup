import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import * as a from "@/server/services/admin";
import { becomeStaff } from "@/server/services/onboarding";
import { isAdminEmail } from "@/server/policies/admin";
import { db, makeAccount, makeSchool, resetDb } from "./helpers";

const ADMIN = { email: "boss@tierup.test" };
beforeAll(() => {
  process.env.ADMIN_EMAILS = "boss@tierup.test, Ops@TierUp.test";
});
beforeEach(async () => {
  sent.length = 0;
  await resetDb();
});
afterAll(() => db.$disconnect());

describe("admin access", () => {
  it("comes only from ADMIN_EMAILS (case-insensitive)", async () => {
    expect(isAdminEmail("ops@tierup.test")).toBe(true);
    expect(isAdminEmail("someone@tierup.test")).toBe(false);
    await expect(a.schoolsOverview({ email: "someone@tierup.test" })).rejects.toThrow(/Admins only/);
  });
});

describe("staff domains", () => {
  it("validates domains, blocks personal mail and domains owned by another school", async () => {
    const flint = await makeSchool("Flint Hill School", []);
    const other = await makeSchool("Other School", ["other.org"]);
    expect((await a.addStaffDomain(ADMIN, flint.id, "@FlintHill.org")).toast).toBe("flinthill.org added to Flint Hill School");
    await expect(a.addStaffDomain(ADMIN, flint.id, "gmail.com")).rejects.toThrow(/Personal email providers/);
    await expect(a.addStaffDomain(ADMIN, flint.id, "not a domain")).rejects.toThrow(/like flinthill.org/);
    await expect(a.addStaffDomain(ADMIN, flint.id, "other.org")).rejects.toThrow(/already the staff domain of Other School/);
    await a.removeStaffDomain(ADMIN, flint.id, "flinthill.org");
    expect((await db.school.findUniqueOrThrow({ where: { id: flint.id } })).staffEmailDomains).toEqual([]);
    expect((await a.schoolsOverview(ADMIN, "flint")).map((s) => s.name)).toEqual(["Flint Hill School"]);
    void other;
  });

  it("adds a school with default slots and spaces", async () => {
    const { schoolId } = await a.addSchool(ADMIN, { name: "Hilltop Prep", state: "MD", city: "Bethesda", domain: "hilltop.org" });
    const s = await db.school.findUniqueOrThrow({ where: { id: schoolId }, include: { slots: true } });
    expect(s).toMatchObject({ state: "MD", staffEmailDomains: ["hilltop.org"], approvedSpaces: ["Library", "Room 204 (Math)", "Learning commons"] });
    expect(s.slots).toHaveLength(5);
    await expect(a.addSchool(ADMIN, { name: "Hilltop Prep", state: "MD" })).rejects.toThrow(/already exists/);
  });
});

describe("waitlist", () => {
  it("verifying a teacher's request opens staff sign-up for their domain and notifies them", async () => {
    const school = await makeSchool("Maret School", []);
    const t1 = await makeAccount("ms.k@maret.org");
    const t2 = await makeAccount("mr.j@maret.org");
    expect(await becomeStaff(t1.id, { schoolId: school.id, displayName: "Ms. K" })).toMatchObject({ status: "waitlisted" });
    await becomeStaff(t2.id, { schoolId: school.id, displayName: "Mr. J" });
    const gmailTeacher = await makeAccount("teacher@gmail.com");
    await becomeStaff(gmailTeacher.id, { schoolId: school.id, displayName: "Mr. T" });

    const list = await a.waitlist(ADMIN);
    expect(list.staff.map((e) => [e.email, e.freeMail])).toEqual([["ms.k@maret.org", false], ["mr.j@maret.org", false], ["teacher@gmail.com", true]]);

    const { toast } = await a.verifyStaffRequest(ADMIN, list.staff[0]!.id);
    expect(toast).toBe("maret.org verified for Maret School; 2 teachers notified");
    expect(sent.map((e) => e.to).sort()).toEqual(["mr.j@maret.org", "ms.k@maret.org"]);
    expect((await a.waitlist(ADMIN)).staff.map((e) => e.email)).toEqual(["teacher@gmail.com"]);
    await expect(a.verifyStaffRequest(ADMIN, list.staff[2]!.id)).rejects.toThrow(/Personal email providers/);

    expect(await becomeStaff(t1.id, { schoolId: school.id, displayName: "Ms. K" })).toEqual({ status: "ok" });
  });

  it("dismisses and marks student entries", async () => {
    const e = await db.schoolWaitlist.create({ data: { kind: "student", email: "kid@gmail.com", schoolName: "Hilltop Prep" } });
    expect((await a.waitlist(ADMIN)).students).toHaveLength(1);
    await a.resolveWaitlistEntry(ADMIN, e.id, "school_added");
    expect((await a.waitlist(ADMIN)).students).toHaveLength(0);
    await expect(a.resolveWaitlistEntry(ADMIN, e.id, "dismissed")).rejects.toThrow(/already handled/);
  });
});
