import type { ConsentStatus, Role } from "@prisma/client";

// Pure access rules (no auth/session imports) so services and tests can share them.

/** Where a signed-in user belongs by default. */
export function homePathFor(user: { roles: Role[]; onboardedAt: Date | null }): string {
  if (!user.onboardedAt) return "/onboarding";
  if (user.roles.includes("staff")) return "/staff";
  if (user.roles.includes("learner")) return "/home";
  if (user.roles.includes("tutor")) return "/dashboard";
  return "/onboarding";
}

/** Only relative, same-site paths are allowed as post-login destinations. */
export function safeCallbackPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

/** Students (learners and tutors) need an approved parent consent to book, accept or tutor. */
export function hasParentConsent(user: { roles: Role[]; consent: { status: ConsentStatus } | null }): boolean {
  const isStudent = user.roles.includes("learner") || user.roles.includes("tutor");
  return !isStudent || user.consent?.status === "approved";
}
