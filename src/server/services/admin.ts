import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { sendEmailSafely } from "@/server/email/send";
import { staffDomainVerifiedEmail } from "@/server/email/templates";
import { isAdminEmail } from "@/server/policies/admin";
import { emailDomain } from "@/lib/validation/onboarding";
import { DEFAULT_SLOTS, DEFAULT_SPACES } from "@/lib/school-defaults";

// TierUp admin tools: schools' staff domains, adding schools, and the waitlist.

type Admin = { email: string };
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

function assertAdmin(admin: Admin) {
  if (!isAdminEmail(admin.email)) throw new UserError("Admins only.");
}

/** Consumer mail providers: never valid as a school's staff domain (anyone could sign up as staff). */
export const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com",
  "yandex.com", "comcast.net", "verizon.net",
]);

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((d) => d.replace(/^@/, ""))
  .refine((d) => /^(?=.{3,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/.test(d), "Enter a domain like flinthill.org")
  .refine((d) => !FREE_MAIL_DOMAINS.has(d), "Personal email providers can't be a school's staff domain");

export async function schoolsOverview(admin: Admin, q?: string) {
  assertAdmin(admin);
  const schools = await db.school.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    include: { users: { select: { roles: true } }, waitlist: { where: { resolvedAt: null }, select: { id: true } } },
    orderBy: [{ isDemo: "asc" }, { state: "asc" }, { name: "asc" }],
  });
  return schools.map((s) => ({
    id: s.id,
    name: s.name,
    state: s.state,
    isDemo: s.isDemo,
    active: s.active,
    domains: s.staffEmailDomains,
    staff: s.users.filter((u) => u.roles.includes("staff")).length,
    students: s.users.filter((u) => u.roles.includes("learner") || u.roles.includes("tutor")).length,
    waiting: s.waitlist.length,
  }));
}

export async function addStaffDomain(admin: Admin, schoolId: string, rawDomain: string) {
  assertAdmin(admin);
  const domain = domainSchema.parse(rawDomain);
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new UserError("School not found.");
  const owner = await db.school.findFirst({ where: { staffEmailDomains: { has: domain }, id: { not: schoolId } } });
  if (owner) throw new UserError(`${domain} is already the staff domain of ${owner.name}.`);
  if (!school.staffEmailDomains.includes(domain)) {
    await db.school.update({ where: { id: schoolId }, data: { staffEmailDomains: [...school.staffEmailDomains, domain] } });
  }
  return { toast: `${domain} added to ${school.name}` };
}

export async function removeStaffDomain(admin: Admin, schoolId: string, domain: string) {
  assertAdmin(admin);
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new UserError("School not found.");
  await db.school.update({ where: { id: schoolId }, data: { staffEmailDomains: school.staffEmailDomains.filter((d) => d !== domain) } });
  return { toast: `${domain} removed. Existing staff keep their access.` };
}

export const newSchoolSchema = z.object({
  name: z.string().trim().min(3, "Enter the school's full name").max(120),
  state: z.enum(["DC", "MD", "VA"]),
  city: z.string().trim().max(60).optional(),
  domain: z.union([domainSchema, z.literal("")]).optional(),
});

export async function addSchool(admin: Admin, raw: z.input<typeof newSchoolSchema>) {
  assertAdmin(admin);
  const input = newSchoolSchema.parse(raw);
  try {
    const school = await db.school.create({
      data: {
        name: input.name,
        state: input.state,
        city: input.city || null,
        staffEmailDomains: input.domain ? [input.domain] : [],
        approvedSpaces: DEFAULT_SPACES,
        slots: { create: DEFAULT_SLOTS.map((slot, i) => ({ ...slot, sortOrder: i })) },
      },
    });
    return { toast: `${school.name} added`, schoolId: school.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new UserError("A school with that name already exists.");
    throw err;
  }
}

export async function waitlist(admin: Admin) {
  assertAdmin(admin);
  const entries = await db.schoolWaitlist.findMany({
    where: { resolvedAt: null },
    include: { school: { select: { id: true, name: true, staffEmailDomains: true } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    staff: entries
      .filter((e) => e.kind === "staff")
      .map((e) => ({
        id: e.id,
        email: e.email,
        domain: emailDomain(e.email),
        freeMail: FREE_MAIL_DOMAINS.has(emailDomain(e.email)),
        school: e.school,
        createdAt: e.createdAt,
      })),
    students: entries
      .filter((e) => e.kind === "student")
      .map((e) => ({ id: e.id, email: e.email, schoolName: e.schoolName ?? "(no name given)", createdAt: e.createdAt })),
  };
}

/**
 * A teacher asked to join a school with no verified domain: add their email's domain to that school,
 * tell them (and anyone else waiting with the same domain) they can sign up now.
 */
export async function verifyStaffRequest(admin: Admin, entryId: string) {
  assertAdmin(admin);
  const entry = await db.schoolWaitlist.findUnique({ where: { id: entryId }, include: { school: true } });
  if (!entry || entry.kind !== "staff" || !entry.school || entry.resolvedAt) throw new UserError("That request was already handled.");
  const domain = domainSchema.parse(emailDomain(entry.email));
  await addStaffDomain(admin, entry.school.id, domain);

  const sameDomain = await db.schoolWaitlist.findMany({ where: { kind: "staff", schoolId: entry.school.id, resolvedAt: null } });
  const resolved = sameDomain.filter((e) => emailDomain(e.email) === domain);
  await db.schoolWaitlist.updateMany({ where: { id: { in: resolved.map((e) => e.id) } }, data: { resolvedAt: new Date(), resolution: "verified" } });
  for (const e of resolved) {
    await sendEmailSafely(staffDomainVerifiedEmail({ to: e.email, schoolName: entry.school.name, url: `${appUrl()}/login?callbackUrl=/onboarding/staff` }));
  }
  return { toast: `${domain} verified for ${entry.school.name}; ${resolved.length} teacher${resolved.length === 1 ? "" : "s"} notified` };
}

export async function resolveWaitlistEntry(admin: Admin, entryId: string, resolution: "dismissed" | "school_added") {
  assertAdmin(admin);
  const { count } = await db.schoolWaitlist.updateMany({ where: { id: entryId, resolvedAt: null }, data: { resolvedAt: new Date(), resolution } });
  if (count === 0) throw new UserError("That entry was already handled.");
  return { toast: resolution === "dismissed" ? "Dismissed" : "Marked as added" };
}
