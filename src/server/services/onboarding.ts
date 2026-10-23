import "server-only";
import { randomBytes } from "node:crypto";
import type { Format, Prisma, Subject } from "@prisma/client";
import { db } from "@/server/db";
import { demoSchoolsEnabled, staffDomainsRelaxed } from "@/server/demo";
import { parentConsentEnabled } from "@/server/policies/rules";
import { UserError } from "@/server/errors";
import { sendEmailSafely } from "@/server/email/send";
import { parentConsentEmail } from "@/server/email/templates";
import { notifyTeachersOfRequests } from "@/server/services/approval-notifications";
import { displayName } from "@/lib/names";
import {
  customName,
  emailDomain,
  isCustomKey,
  onboardingSchema,
  staffOnboardingSchema,
  type OnboardingInput,
  type StaffOnboardingInput,
} from "@/lib/validation/onboarding";

export const newToken = () => randomBytes(24).toString("base64url");

/**
 * A learner's class teacher: optional, but when given it must be a school staff address (the
 * teacher gets session summaries) and not the student's own.
 */
export function assertClassTeacher(teacherEmail: string | undefined, own: string[], staffDomains: string[]) {
  if (!teacherEmail) return;
  if (own.includes(teacherEmail)) throw new UserError("Enter your teacher's email, not your own.");
  const domains = staffDomainsRelaxed() ? [] : staffDomains;
  if (domains.length && !domains.includes(emailDomain(teacherEmail))) throw new UserError(`Use your teacher's school email (…@${domains[0]}).`);
}
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

const WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * Finishes student onboarding: profile, school, subjects (with a pending per-subject approval
 * for tutors), availability and a pending parent consent. Emails go out after the commit.
 */
export async function completeOnboarding(userId: string, raw: OnboardingInput) {
  const input = onboardingSchema.parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.onboardedAt) throw new UserError("You've already finished signing up.");

  const ownEmail = user.email.toLowerCase();
  const consentOn = parentConsentEnabled();
  if (consentOn && !input.parentEmail) throw new UserError("Enter your parent's email.");
  if (consentOn && input.parentEmail === ownEmail) throw new UserError("Enter your parent's email, not your own.");

  const school =
    input.school.kind === "listed"
      ? await db.school.findUnique({ where: { id: input.school.schoolId }, include: { slots: true } })
      : null;
  if (input.school.kind === "listed") {
    if (!school || (school.isDemo && !demoSchoolsEnabled())) throw new UserError("Pick your school from the list.");
  }

  const catalogIds = input.subjectKeys.filter((k) => !isCustomKey(k));
  const customNames = [...new Set(input.subjectKeys.filter(isCustomKey).map((k) => customName(k).trim()))];
  const catalog = await db.subject.findMany({ where: { id: { in: catalogIds }, isCustom: false } });
  if (catalog.length !== new Set(catalogIds).size) throw new UserError("One of those subjects isn't available. Please reselect.");

  if (input.role === "learner") {
    for (const info of Object.values(input.classes)) assertClassTeacher(info.teacherEmail || undefined, [ownEmail], school?.staffEmailDomains ?? []);
  }
  const parentFyi = !consentOn && input.role === "learner" && input.parentEmail ? input.parentEmail : null;
  if (parentFyi === ownEmail) throw new UserError("Enter your parent's email, not your own.");

  if (input.role === "tutor") {
    const domains = staffDomainsRelaxed() ? [] : (school?.staffEmailDomains ?? []);
    for (const { teacherEmail } of Object.values(input.endorsements)) {
      if (teacherEmail === ownEmail) throw new UserError("Your endorsing teacher can't be you. Enter a teacher's email.");
      if (domains.length && !domains.includes(emailDomain(teacherEmail))) {
        throw new UserError(`Use your teacher's school email (…@${domains[0]}).`);
      }
    }
  }

  const formats: Format[] = input.format === "both" ? ["in_person", "online"] : [input.format];
  const token = newToken();
  const fullName = `${input.firstName} ${input.lastName}`;

  await db.$transaction(async (tx) => {
    const custom: Subject[] = [];
    for (const name of customNames) {
      custom.push(await tx.subject.create({ data: { name, group: "Other", isCustom: true, createdById: userId } }));
    }
    const subjectIdForKey = (key: string) =>
      isCustomKey(key) ? custom.find((s) => s.name === customName(key).trim())!.id : key;

    await tx.user.update({
      where: { id: userId },
      data: {
        name: fullName,
        roles: [input.role],
        schoolId: school?.id ?? null,
        grade: input.grade,
        schoolEmail: input.schoolEmail || null,
        formats,
        availabilityBlocks: input.blocks,
        onboardedAt: new Date(),
      },
    });

    if (school) {
      const slots = school.slots.filter((s) => (input.blocks as string[]).includes(s.block));
      await tx.availabilitySlot.createMany({
        data: slots.flatMap((s) => WEEKDAYS.map((weekday) => ({ userId, weekday, slotId: s.id }))),
        skipDuplicates: true,
      });
    }

    if (input.role === "learner") {
      await tx.learnerSubject.createMany({
        data: input.subjectKeys.map((k) => {
          const info = input.classes[k] ?? {};
          return {
            userId,
            subjectId: subjectIdForKey(k),
            className: info.className || null,
            teacherName: info.teacherName || null,
            teacherEmail: info.teacherEmail || null,
          };
        }),
        skipDuplicates: true,
      });
      if (parentFyi) await tx.user.update({ where: { id: userId }, data: { parentEmail: parentFyi, parentOptOutToken: newToken() } });
    } else {
      const teacherEmails = [...new Set(Object.values(input.endorsements).map((e) => e.teacherEmail))];
      const staff = school
        ? await tx.user.findMany({ where: { email: { in: teacherEmails }, schoolId: school.id, roles: { has: "staff" } } })
        : [];
      const rows: Prisma.TutorSubjectCreateManyInput[] = input.subjectKeys.map((k) => {
        const e = input.endorsements[k]!;
        return {
          tutorId: userId,
          subjectId: subjectIdForKey(k),
          endorserEmail: e.teacherEmail,
          endorserId: staff.find((s) => s.email.toLowerCase() === e.teacherEmail)?.id ?? null,
          courseGrade: e.courseGrade ?? null,
        };
      });
      await tx.tutorSubject.createMany({ data: rows, skipDuplicates: true });
      await tx.tutorStatus.upsert({ where: { tutorId: userId }, create: { tutorId: userId }, update: {} });
    }

    if (consentOn && input.parentEmail) await tx.parentConsent.upsert({
      where: { studentId: userId },
      create: { studentId: userId, parentEmail: input.parentEmail, token, sendSummaries: input.sendSummaries },
      update: { parentEmail: input.parentEmail, token, sendSummaries: input.sendSummaries, status: "pending", decidedAt: null, lastSentAt: new Date() },
    });

    if (input.school.kind === "unlisted") {
      await tx.schoolWaitlist.create({ data: { kind: "student", email: user.email, schoolName: input.school.schoolName } });
    }

  });

  // Notifications (after commit, never failing the sign-up).
  const name = displayName(fullName);
  if (consentOn && input.parentEmail) {
    await sendEmailSafely(
      parentConsentEmail({
        to: input.parentEmail,
        studentName: name,
        schoolName: school?.name ?? null,
        role: input.role,
        url: `${appUrl()}/consent/${token}`,
      }),
    );
  }
  if (input.role === "tutor") {
    const requested = await db.tutorSubject.findMany({ where: { tutorId: userId }, select: { id: true } });
    await notifyTeachersOfRequests(requested.map((r) => r.id));
  }

  return input.role === "tutor"
    ? { redirectTo: "/dashboard", toast: "Approval requests sent to your teachers" }
    : { redirectTo: "/home", toast: consentOn ? "Consent link sent to your parent" : "You're all set" };
}

/**
 * Turns a signed-in account into a staff account for a school, if its (provider-verified)
 * email is on one of the school's staff domains. Schools without domains go on a waitlist.
 */
export async function becomeStaff(userId: string, raw: StaffOnboardingInput) {
  const input = staffOnboardingSchema.parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.roles.includes("staff")) return { status: "ok" as const };
  if (user.onboardedAt) {
    throw new UserError("This is a student account. Sign out, then sign in with your school staff email.");
  }

  const school = await db.school.findUnique({ where: { id: input.schoolId } });
  if (!school || (school.isDemo && !demoSchoolsEnabled())) throw new UserError("Pick your school from the list.");

  const domains = school.staffEmailDomains;
  if (staffDomainsRelaxed()) {
    // Testing mode: skip domain verification entirely.
  } else if (domains.length === 0) {
    const exists = await db.schoolWaitlist.findFirst({ where: { kind: "staff", email: user.email, schoolId: school.id } });
    if (!exists) await db.schoolWaitlist.create({ data: { kind: "staff", email: user.email, schoolId: school.id } });
    return { status: "waitlisted" as const, schoolName: school.name };
  } else if (!domains.includes(emailDomain(user.email))) {
    throw new UserError(`Sign in with your ${school.name} email address (…@${domains[0]}). You're signed in as ${user.email}.`);
  }

  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { name: input.displayName, roles: ["staff"], schoolId: school.id, onboardedAt: new Date() },
    }),
    db.school.update({ where: { id: school.id }, data: { active: true } }),
    // Endorsement requests that named this teacher before they had an account.
    db.tutorSubject.updateMany({
      where: { endorserEmail: user.email.toLowerCase(), endorserId: null, tutor: { schoolId: school.id } },
      data: { endorserId: userId },
    }),
  ]);
  return { status: "ok" as const };
}
