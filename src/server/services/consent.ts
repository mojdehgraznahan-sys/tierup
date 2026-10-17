import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { sendEmail } from "@/server/email/send";
import { parentConsentEmail } from "@/server/email/templates";
import { displayName } from "@/lib/names";

const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

/** Public, token-authenticated view of a consent request. */
export async function getConsentByToken(token: string) {
  return db.parentConsent.findUnique({
    where: { token },
    include: { student: { include: { school: true } } },
  });
}

/** The parent approves or declines. They can change their answer later from the same link. */
export async function decideConsent(token: string, decision: "approved" | "declined") {
  const consent = await db.parentConsent.findUnique({ where: { token } });
  if (!consent) throw new UserError("This consent link isn't valid. Ask your child to resend it.");
  return db.parentConsent.update({
    where: { id: consent.id },
    data: { status: decision, decidedAt: new Date() },
  });
}

/** The student resends the consent email (rate-limited). */
export async function resendConsent(studentId: string) {
  const consent = await db.parentConsent.findUnique({
    where: { studentId },
    include: { student: { include: { school: true } } },
  });
  if (!consent) throw new UserError("There's no consent request on your account.");
  if (consent.status === "approved") throw new UserError("Your parent already approved.");
  const wait = consent.lastSentAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
  if (wait > 0) throw new UserError(`You can resend in ${Math.ceil(wait / 60000)} min.`);

  await db.parentConsent.update({ where: { id: consent.id }, data: { lastSentAt: new Date() } });
  const { student } = consent;
  await sendEmail(
    parentConsentEmail({
      to: consent.parentEmail,
      studentName: displayName(student.name),
      schoolName: student.school?.name ?? null,
      role: student.roles.includes("tutor") ? "tutor" : "learner",
      url: `${appUrl()}/consent/${consent.token}`,
    }),
  );
}
