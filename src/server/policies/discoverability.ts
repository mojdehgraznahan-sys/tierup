import type { Format, Prisma } from "@prisma/client";
import { parentConsentEnabled } from "./rules";

/**
 * BACKEND.md › Discoverability: a tutor shows for a subject only if that TutorSubject is approved,
 * the tutor isn't paused, and (when parent consent is on) their parent consent is approved.
 */
export function discoverableTutorSubject(subjectId?: string): Prisma.TutorSubjectWhereInput {
  return {
    status: "approved",
    ...(subjectId ? { subjectId } : {}),
    tutor: discoverableTutor(),
  };
}

export function discoverableTutor(): Prisma.UserWhereInput {
  return {
    onboardedAt: { not: null },
    roles: { has: "tutor" },
    ...(parentConsentEnabled() ? { consent: { is: { status: "approved" as const } } } : {}),
    OR: [{ tutorStatus: { is: null } }, { tutorStatus: { is: { paused: false } } }],
  };
}

/**
 * Formats a learner can actually use with a tutor (BACKEND.md › Cross-school):
 * different schools (or no school) → online only.
 */
export function effectiveFormats(tutor: { schoolId: string | null; formats: Format[] }, learnerSchoolId: string | null): Format[] {
  const sameSchool = !!learnerSchoolId && tutor.schoolId === learnerSchoolId;
  return tutor.formats.filter((f) => f === "online" || sameSchool);
}

export function formatLabel(formats: Format[]): string {
  if (formats.includes("in_person") && formats.includes("online")) return "In person + online";
  if (formats.includes("online")) return "Online only";
  if (formats.includes("in_person")) return "In person only";
  return "Unavailable";
}
