import "server-only";
import type { Format } from "@prisma/client";
import { db } from "@/server/db";
import { discoverableTutor, discoverableTutorSubject, effectiveFormats } from "@/server/policies/discoverability";
import { displayName, gradeLabel } from "@/lib/names";
import { overlap, slotText, upcomingSlots, type WeeklySlot } from "@/lib/slots";

/** The learner looking at tutors. */
export type Viewer = { id: string; schoolId: string | null };

export type TutorCard = {
  id: string;
  name: string;
  grade: string;
  schoolName: string | null;
  sameSchool: boolean;
  formats: Format[];
  subjects: { id: string; name: string }[];
  rating: { avg: number; count: number } | null;
};

/** Cards list every approved subject, not just the filtered one. */
const tutorInclude = {
  school: true,
  tutorSubjects: {
    where: discoverableTutorSubject(),
    include: { subject: true, endorser: { select: { name: true } } },
    orderBy: { subject: { name: "asc" as const } },
  },
} as const;

/** Average stars and count per tutor, from reviews of their sessions. */
async function ratings(tutorIds: string[]) {
  if (tutorIds.length === 0) return new Map<string, { avg: number; count: number }>();
  const rows = await db.$queryRaw<{ tutorId: string; avg: number; count: bigint }[]>`
    SELECT s."tutorId", AVG(r.stars)::float AS avg, COUNT(*) AS count
    FROM "Review" r JOIN "TutoringSession" s ON s.id = r."sessionId"
    WHERE s."tutorId" = ANY(${tutorIds}) AND r.happened = 'yes'
    GROUP BY s."tutorId"`;
  return new Map(rows.map((r) => [r.tutorId, { avg: r.avg, count: Number(r.count) }]));
}

async function findTutors(viewer: Viewer, subjectId?: string) {
  return db.user.findMany({
    where: {
      ...discoverableTutor(),
      id: { not: viewer.id },
      tutorSubjects: { some: discoverableTutorSubject(subjectId) },
    },
    include: tutorInclude,
  });
}

function toCard(
  t: Awaited<ReturnType<typeof findTutors>>[number],
  viewer: Viewer,
  rating: TutorCard["rating"],
): TutorCard {
  return {
    id: t.id,
    name: displayName(t.name),
    grade: gradeLabel(t.grade),
    schoolName: t.school?.name ?? null,
    sameSchool: !!viewer.schoolId && t.schoolId === viewer.schoolId,
    formats: effectiveFormats(t, viewer.schoolId),
    subjects: t.tutorSubjects.map((ts) => ({ id: ts.subjectId, name: ts.subject.name })),
    rating: rating ?? null,
  };
}

/**
 * Rating used for ordering: pulls averages from few reviews toward a neutral 4.5, so a 4.9 from
 * 12 reviews ranks above a 5.0 from 2. Display still shows the true average.
 */
export function rankScore(rating: TutorCard["rating"]): number {
  const PRIOR = 4.5;
  const WEIGHT = 3;
  // New tutors (no reviews) sit at the neutral prior rather than below everyone.
  return rating ? (rating.avg * rating.count + PRIOR * WEIGHT) / (rating.count + WEIGHT) : PRIOR;
}

export type BrowseFilters = { subjectId?: string; inPerson: boolean; online: boolean; sameSchoolOnly: boolean };

/** Browse: teacher-approved tutors the viewer can actually meet, same school first, then by rating. */
export async function browseTutors(viewer: Viewer, f: BrowseFilters): Promise<TutorCard[]> {
  const tutors = await findTutors(viewer, f.subjectId);
  const rated = await ratings(tutors.map((t) => t.id));
  return tutors
    .map((t) => toCard(t, viewer, rated.get(t.id) ?? null))
    .filter((c) => c.formats.length > 0)
    .filter((c) => !f.sameSchoolOnly || c.sameSchool)
    .filter((c) => (f.inPerson && c.formats.includes("in_person")) || (f.online && c.formats.includes("online")))
    .sort(
      (a, b) =>
        Number(b.sameSchool) - Number(a.sameSchool) ||
        rankScore(b.rating) - rankScore(a.rating) ||
        a.name.localeCompare(b.name),
    );
}

/** Subjects that currently have at least one discoverable tutor (for filter dropdowns). */
export async function subjectsWithTutors(viewer: Viewer) {
  const rows = await db.tutorSubject.findMany({
    where: { ...discoverableTutorSubject(), tutorId: { not: viewer.id } },
    select: { subject: { select: { id: true, name: true } } },
    distinct: ["subjectId"],
  });
  return rows.map((r) => r.subject).sort((a, b) => a.name.localeCompare(b.name));
}

/** "Tutors for your classes" on Student Home: tutors teaching any of the learner's subjects. */
export async function tutorsForMyClasses(viewer: Viewer, limit = 4): Promise<TutorCard[]> {
  const mine = await db.learnerSubject.findMany({ where: { userId: viewer.id }, select: { subjectId: true } });
  const ids = mine.map((m) => m.subjectId);
  if (ids.length === 0) return [];
  const tutors = await db.user.findMany({
    where: { ...discoverableTutor(), id: { not: viewer.id }, tutorSubjects: { some: { ...discoverableTutorSubject(), subjectId: { in: ids } } } },
    include: tutorInclude,
  });
  const rated = await ratings(tutors.map((t) => t.id));
  return tutors
    .map((t) => toCard(t, viewer, rated.get(t.id) ?? null))
    .filter((c) => c.formats.length > 0)
    .map((c) => ({ ...c, subjects: [...c.subjects].sort((a, b) => Number(ids.includes(b.id)) - Number(ids.includes(a.id))) }))
    .sort((a, b) => Number(b.sameSchool) - Number(a.sameSchool) || rankScore(b.rating) - rankScore(a.rating))
    .slice(0, limit);
}

async function weeklyAvailability(userId: string): Promise<WeeklySlot[]> {
  const rows = await db.availabilitySlot.findMany({ where: { userId }, include: { slot: true } });
  return rows.map((r) => ({ weekday: r.weekday, startMinute: r.slot.startMinute, label: r.slot.label }));
}

async function busyTimes(userId: string) {
  return db.tutoringSession.findMany({
    where: { OR: [{ tutorId: userId }, { learnerId: userId }], status: "confirmed", startsAt: { gte: new Date(Date.now() - 86400000) } },
    select: { startsAt: true, durationMin: true },
  });
}

/** Tutor profile, or null if the tutor isn't discoverable. */
export async function tutorProfile(viewer: Viewer, tutorId: string) {
  if (tutorId === viewer.id) return null;
  const tutor = await db.user.findFirst({ where: { id: tutorId, ...discoverableTutor() }, include: tutorInclude });
  if (!tutor || tutor.tutorSubjects.length === 0) return null;

  const formats = effectiveFormats(tutor, viewer.schoolId);
  if (formats.length === 0) return null;

  const [rated, sessionCount, reviews, weekly, busy] = await Promise.all([
    ratings([tutor.id]),
    db.tutoringSession.count({ where: { tutorId, status: "completed" } }),
    db.review.findMany({
      where: { session: { tutorId }, happened: "yes", comment: { not: null } },
      include: { learner: { select: { grade: true } }, session: { include: { subject: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    weeklyAvailability(tutorId),
    busyTimes(tutorId),
  ]);
  const next = upcomingSlots(weekly, { now: new Date(), busy })[0];
  const endorsers = [...new Set(tutor.tutorSubjects.map((ts) => ts.endorser?.name).filter((n): n is string => !!n))];

  return {
    id: tutor.id,
    name: displayName(tutor.name),
    grade: gradeLabel(tutor.grade),
    schoolName: tutor.school?.name ?? null,
    sameSchool: !!viewer.schoolId && tutor.schoolId === viewer.schoolId,
    sessionCount,
    endorsers,
    rating: rated.get(tutor.id) ?? null,
    formats,
    bio: tutor.bio,
    subjects: tutor.tutorSubjects.map((ts) => ({ id: ts.subjectId, name: ts.subject.name })),
    reviews: reviews.map((r) => ({
      id: r.id,
      text: r.comment!,
      by: [
        r.learner.grade ? `${gradeLabel(r.learner.grade)} grader` : "Student",
        r.session.subject.name,
        r.createdAt.toLocaleString("en-US", { month: "short", timeZone: "America/New_York" }),
      ].join(" · "),
    })),
    nextOpen: next ? slotText(next.startsAt, next.slot) : null,
  };
}

export type Match = TutorCard & { score: number; overlapCount: number; reasons: string[] };

/**
 * Match me: rank discoverable tutors for a subject by shared free times, same school
 * (in person possible) and rating. Returns the top 3 with human-readable reasons.
 */
export async function matchTutors(viewer: Viewer, subjectId: string, limit = 3): Promise<Match[]> {
  const tutors = await findTutors(viewer, subjectId);
  if (tutors.length === 0) return [];
  const [rated, mine] = await Promise.all([ratings(tutors.map((t) => t.id)), weeklyAvailability(viewer.id)]);
  const theirs = await Promise.all(tutors.map((t) => weeklyAvailability(t.id)));

  return tutors
    .map((t, i) => {
      const card = toCard(t, viewer, rated.get(t.id) ?? null);
      const overlapCount = overlap(theirs[i]!, mine).length;
      return { card, overlapCount };
    })
    .filter(({ card }) => card.formats.length > 0)
    .map(({ card, overlapCount }) => {
      const inPerson = card.formats.includes("in_person");
      const rating = card.rating;
      const score =
        Math.min(overlapCount, 6) * 10 + (card.sameSchool ? 15 : 0) + (rating ? (rating.avg - 3) * 5 + Math.min(rating.count, 10) : 0);
      const reasons = [`${overlapCount} free time${overlapCount === 1 ? "" : "s"} overlap with yours`];
      reasons.push(
        card.sameSchool
          ? inPerson
            ? "Same school: in person works"
            : "Same school: online via Google Meet"
          : "Other school: online via Google Meet",
      );
      if (rating) reasons.push(`Rated ${rating.avg.toFixed(1)} by ${rating.count} student${rating.count === 1 ? "" : "s"}`);
      return { ...card, score, overlapCount, reasons };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
