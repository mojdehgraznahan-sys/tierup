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

/**
 * Parent consent is switched off for now: only teacher approval gates tutoring. PARENT_CONSENT=true
 * brings back the consent step, banners, parent emails and every consent check below.
 */
export function parentConsentEnabled(): boolean {
  return process.env.PARENT_CONSENT === "true";
}

/**
 * Cross-school tutoring (online only) is off for now: learners only see and book tutors at their
 * own school. CROSS_SCHOOL_SESSIONS=true lets them meet tutors from other schools online.
 */
export function crossSchoolEnabled(): boolean {
  return process.env.CROSS_SCHOOL_SESSIONS === "true";
}

/**
 * Session transcripts for AI summaries: TRANSCRIPTS=on. Sessions are only transcribed when both
 * students opted in and they're at the same school.
 */
export function transcriptsEnabled(): boolean {
  return process.env.TRANSCRIPTS === "on";
}

/**
 * Schools with Google Workspace for Education (Education Plus or the Teaching and Learning
 * Upgrade) host their online sessions in their own Workspace, where Meet writes the transcript.
 * GOOGLE_EDUCATION_SCHOOLS="lincoln-hs.org=tierup@lincoln-hs.org,..." maps a school's staff email
 * domain to the Workspace user that owns the meetings. Other schools use TierUp's mic capture.
 */
export function googleEducationOrganizer(staffEmailDomains: string[]): string | null {
  const map = new Map(
    (process.env.GOOGLE_EDUCATION_SCHOOLS ?? "")
      .split(",")
      .map((pair) => pair.split("=").map((x) => x.trim().toLowerCase()))
      .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1]),
  );
  for (const domain of staffEmailDomains) {
    const organizer = map.get(domain.toLowerCase());
    if (organizer) return organizer;
  }
  return null;
}

/** Students (learners and tutors) need an approved parent consent to book, accept or tutor (when enabled). */
export function hasParentConsent(user: { roles: Role[]; consent: { status: ConsentStatus } | null }): boolean {
  if (!parentConsentEnabled()) return true;
  const isStudent = user.roles.includes("learner") || user.roles.includes("tutor");
  return !isStudent || user.consent?.status === "approved";
}

/** Where to email a student's parent, or null when parent consent (and parent email) is off. */
export function parentEmailFor(consent: { parentEmail: string } | null | undefined): string | null {
  return parentConsentEnabled() && consent ? consent.parentEmail : null;
}

/**
 * Open question for the client (BACKEND.md › Open questions #2): may students message before a
 * parent approves? The spec allows it (only booking/tutoring is blocked). Flip to false to block.
 */
export const MESSAGING_BEFORE_CONSENT = true;
