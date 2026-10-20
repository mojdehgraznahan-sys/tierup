import "server-only";
import { z } from "zod";
import type { Format, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { sendEmailSafely } from "@/server/email/send";
import { parentConsentEmail, teacherEndorsementEmail } from "@/server/email/templates";
import { newToken } from "@/server/services/onboarding";
import { detectContactInfo } from "@/lib/moderation";
import { displayName } from "@/lib/names";
import { COURSE_GRADES, emailDomain } from "@/lib/validation/onboarding";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const email = z.string().trim().toLowerCase().email("Enter a valid email address");

/** Everything the Settings page shows. */
export async function settingsView(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      school: { include: { slots: { orderBy: { sortOrder: "asc" } } } },
      consent: true,
      availability: true,
      learnerSubjects: { include: { subject: true }, orderBy: { subject: { name: "asc" } } },
      tutorSubjects: { include: { subject: true, endorser: { select: { name: true } } }, orderBy: { subject: { name: "asc" } } },
    },
  });
  const parts = user.name?.trim().split(/\s+/) ?? [];
  return {
    roles: user.roles,
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
    staffName: user.name ?? "",
    grade: user.grade,
    schoolEmail: user.schoolEmail ?? "",
    bio: user.bio ?? "",
    formats: user.formats,
    school: user.school ? { name: user.school.name, staffDomain: user.school.staffEmailDomains[0] ?? null } : null,
    slots: (user.school?.slots ?? []).filter((s) => s.block !== "weekend").map((s) => ({ id: s.id, label: s.label })),
    availability: user.availability.map((a) => `${a.weekday}:${a.slotId}`),
    learnerSubjects: user.learnerSubjects.map((l) => ({ id: l.subjectId, name: l.subject.name })),
    tutorSubjects: user.tutorSubjects.map((t) => ({
      id: t.id,
      subjectId: t.subjectId,
      name: t.subject.name,
      status: t.status,
      teacher: t.endorser?.name ?? t.endorserEmail ?? null,
    })),
    consent: user.consent ? { parentEmail: user.consent.parentEmail, status: user.consent.status, sendSummaries: user.consent.sendSummaries } : null,
  };
}

// ─── About you ──────────────────────────────────────────────────────────────

export const basicsSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(40),
  lastName: z.string().trim().min(1, "Enter your last name").max(40),
  grade: z.number().int().min(9).max(12).optional(),
  schoolEmail: z.union([email, z.literal("")]).optional(),
  format: z.enum(["in_person", "online", "both"]).optional(),
});

export async function updateBasics(userId: string, raw: z.input<typeof basicsSchema>) {
  const input = basicsSchema.parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const student = user.roles.includes("learner") || user.roles.includes("tutor");
  const formats: Format[] | undefined =
    student && input.format ? (input.format === "both" ? ["in_person", "online"] : [input.format]) : undefined;
  await db.user.update({
    where: { id: userId },
    data: {
      name: `${input.firstName} ${input.lastName}`,
      ...(student && input.grade ? { grade: input.grade } : {}),
      ...(student ? { schoolEmail: input.schoolEmail || null } : {}),
      ...(formats ? { formats } : {}),
    },
  });
  return { toast: "Saved" };
}

/** Staff go by the name students know them by ("Ms. Ortiz"). */
export async function updateStaffName(userId: string, name: string) {
  const value = z.string().trim().min(2, "Enter the name students know you by").max(60).parse(name);
  await db.user.update({ where: { id: userId }, data: { name: value } });
  return { toast: "Saved" };
}

// ─── Bio ────────────────────────────────────────────────────────────────────

export async function updateBio(userId: string, bio: string) {
  const value = z.string().trim().max(500, "Keep it under 500 characters").parse(bio);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.roles.includes("tutor")) throw new UserError("Only tutors have a public bio.");
  const flags = detectContactInfo(value);
  if (flags.length) throw new UserError(`Your bio can't include a ${flags[0]}. Learners contact you through TierUp.`);
  await db.user.update({ where: { id: userId }, data: { bio: value || null } });
  return { toast: "Bio saved" };
}

// ─── Availability ───────────────────────────────────────────────────────────

/** Replaces the weekly availability with `cells` ("weekday:slotId", weekday 1–5, slots from the user's school). */
export async function setAvailability(userId: string, cells: string[]) {
  const parsed = z.array(z.string().regex(/^[1-5]:[\w-]+$/)).max(60).parse(cells);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { school: { include: { slots: true } } } });
  if (!user.school) throw new UserError("Your school isn't on TierUp yet, so there's no timetable to pick from.");
  const slotIds = new Set(user.school.slots.filter((s) => s.block !== "weekend").map((s) => s.id));
  const rows = [...new Set(parsed)].map((c) => {
    const [weekday, slotId] = c.split(":") as [string, string];
    if (!slotIds.has(slotId)) throw new UserError("That time isn't on your school's timetable.");
    return { userId, weekday: Number(weekday), slotId };
  });
  await db.$transaction([db.availabilitySlot.deleteMany({ where: { userId } }), db.availabilitySlot.createMany({ data: rows })]);
  return { toast: rows.length ? `Saved ${rows.length} free time${rows.length === 1 ? "" : "s"}` : "Saved. You won't match with anyone until you add a free time." };
}

// ─── Subjects ───────────────────────────────────────────────────────────────

/** Catalog subject by id, or a custom course by name (created once per user). */
async function resolveSubject(tx: Prisma.TransactionClient, userId: string, input: { subjectId?: string; customName?: string }) {
  if (input.subjectId) {
    const s = await tx.subject.findFirst({ where: { id: input.subjectId, isCustom: false } });
    if (!s) throw new UserError("Pick a subject from the list.");
    return s;
  }
  const name = z.string().trim().min(2, "Custom course names need 2–60 characters").max(60).parse(input.customName ?? "").replace(/\s+/g, " ");
  return (
    (await tx.subject.findFirst({ where: { name, group: "Other", createdById: userId } })) ??
    tx.subject.create({ data: { name, group: "Other", isCustom: true, createdById: userId } })
  );
}

export async function addLearnerSubject(userId: string, input: { subjectId?: string; customName?: string }) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.roles.includes("learner")) throw new UserError("Only learners have classes to get help with.");
  const subject = await db.$transaction(async (tx) => {
    const s = await resolveSubject(tx, userId, input);
    await tx.learnerSubject.upsert({ where: { userId_subjectId: { userId, subjectId: s.id } }, create: { userId, subjectId: s.id }, update: {} });
    return s;
  });
  return { toast: `${subject.name} added` };
}

export async function removeLearnerSubject(userId: string, subjectId: string) {
  await db.learnerSubject.deleteMany({ where: { userId, subjectId } });
  return { toast: "Removed" };
}

export const tutorSubjectSchema = z.object({
  subjectId: z.string().optional(),
  customName: z.string().optional(),
  teacherEmail: email,
  courseGrade: z.enum(COURSE_GRADES).optional(),
});

/** A new subject to tutor: pending until a teacher at the school approves it (same rules as onboarding). */
export async function addTutorSubject(userId: string, raw: z.input<typeof tutorSubjectSchema>) {
  const input = tutorSubjectSchema.parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { school: true, consent: true } });
  if (!user.roles.includes("tutor")) throw new UserError("Only tutors can add subjects to teach.");
  if (input.teacherEmail === user.email.toLowerCase()) throw new UserError("Your endorsing teacher can't be you.");
  if (input.teacherEmail === user.consent?.parentEmail) throw new UserError("Your parent and your teacher need different email addresses.");
  const domains = user.school?.staffEmailDomains ?? [];
  if (domains.length && !domains.includes(emailDomain(input.teacherEmail))) {
    throw new UserError(`Use your teacher's school email (…@${domains[0]}).`);
  }

  const subject = await db.$transaction(async (tx) => {
    const s = await resolveSubject(tx, userId, input);
    const existing = await tx.tutorSubject.findUnique({ where: { tutorId_subjectId: { tutorId: userId, subjectId: s.id } } });
    if (existing && existing.status !== "revoked") throw new UserError(`You've already asked to tutor ${s.name}.`);
    const staff = user.schoolId
      ? await tx.user.findFirst({ where: { email: input.teacherEmail, schoolId: user.schoolId, roles: { has: "staff" } } })
      : null;
    const data = { endorserEmail: input.teacherEmail, endorserId: staff?.id ?? null, courseGrade: input.courseGrade ?? null, status: "pending" as const, decidedAt: null, decidedById: null };
    await tx.tutorSubject.upsert({
      where: { tutorId_subjectId: { tutorId: userId, subjectId: s.id } },
      create: { tutorId: userId, subjectId: s.id, ...data },
      update: data,
    });
    return s;
  });

  await sendEmailSafely(
    teacherEndorsementEmail({
      to: input.teacherEmail,
      tutorName: displayName(user.name),
      schoolName: user.school?.name ?? null,
      subjects: [subject.name],
      url: `${appUrl()}/onboarding/staff`,
    }),
  );
  return { toast: `Approval request for ${subject.name} sent to your teacher` };
}

/** Stop tutoring a subject (or withdraw a pending request). Past sessions and hours are kept. */
export async function removeTutorSubject(userId: string, tutorSubjectId: string) {
  const { count } = await db.tutorSubject.deleteMany({ where: { id: tutorSubjectId, tutorId: userId } });
  if (count === 0) throw new UserError("That subject isn't on your list.");
  return { toast: "Removed. Learners won't see you for it anymore." };
}

// ─── Parent or guardian ─────────────────────────────────────────────────────

export const parentSchema = z.object({ parentEmail: email, sendSummaries: z.boolean() });

/**
 * Updates the parent contact. A new email address always needs fresh consent (so a student can't
 * swap in an address they control); only the summaries preference changes in place.
 */
export async function updateParent(userId: string, raw: z.input<typeof parentSchema>) {
  const input = parentSchema.parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { consent: true, school: true } });
  if (!user.consent) throw new UserError("There's no parent consent on your account.");
  if (input.parentEmail === user.email.toLowerCase() || input.parentEmail === user.schoolEmail?.toLowerCase()) {
    throw new UserError("Enter your parent's email, not your own.");
  }

  if (input.parentEmail === user.consent.parentEmail.toLowerCase()) {
    await db.parentConsent.update({ where: { id: user.consent.id }, data: { sendSummaries: input.sendSummaries } });
    return { toast: "Saved", reconsent: false };
  }

  const token = newToken();
  await db.parentConsent.update({
    where: { id: user.consent.id },
    data: { parentEmail: input.parentEmail, sendSummaries: input.sendSummaries, token, status: "pending", decidedAt: null, lastSentAt: new Date() },
  });
  await sendEmailSafely(
    parentConsentEmail({
      to: input.parentEmail,
      studentName: displayName(user.name),
      schoolName: user.school?.name ?? null,
      role: user.roles.includes("tutor") && !user.roles.includes("learner") ? "tutor" : "learner",
      url: `${appUrl()}/consent/${token}`,
    }),
  );
  return { toast: "Consent link sent to the new email", reconsent: true };
}
