import "server-only";
import { db } from "@/server/db";
import { parentConsentEnabled } from "@/server/policies/rules";
import { newToken } from "@/server/services/onboarding";
import { displayName } from "@/lib/names";

type Learner = {
  parentEmail: string | null;
  parentSummariesOff: boolean;
  consent: { parentEmail: string; sendSummaries: boolean } | null;
};

/**
 * Where a learner's FYI session summaries go: the consent record's parent while parent consent is
 * on (if they chose summaries), otherwise the optional parent email. Null when there's none or the
 * parent turned them off.
 */
export function parentFyiRecipient(learner: Learner): string | null {
  if (learner.parentSummariesOff) return null;
  if (parentConsentEnabled()) return learner.consent?.sendSummaries ? learner.consent.parentEmail : null;
  return learner.parentEmail;
}

/** The learner's opt-out token for the "stop these emails" link (created on first use). */
export async function parentOptOutToken(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { parentOptOutToken: true } });
  if (user.parentOptOutToken) return user.parentOptOutToken;
  const token = newToken();
  await db.user.update({ where: { id: userId }, data: { parentOptOutToken: token } });
  return token;
}

/** Public opt-out page: who it's about, without revealing more. */
export async function parentOptOutView(token: string) {
  const user = await db.user.findUnique({ where: { parentOptOutToken: token }, select: { name: true, parentSummariesOff: true } });
  return user ? { studentName: displayName(user.name), off: user.parentSummariesOff } : null;
}

/** The parent turns FYI summaries off (one click from the email; the student can turn them back on). */
export async function stopParentSummaries(token: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { parentOptOutToken: token }, select: { id: true } });
  if (!user) return false;
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { parentSummariesOff: true } }),
    db.parentConsent.updateMany({ where: { studentId: user.id }, data: { sendSummaries: false } }),
  ]);
  return true;
}
