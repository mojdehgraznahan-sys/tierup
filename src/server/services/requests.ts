import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { sendEmailSafely } from "@/server/email/send";
import { newRequestEmail, requestResponseEmail } from "@/server/email/templates";
import { discoverableTutor, discoverableTutorSubject, effectiveFormats } from "@/server/policies/discoverability";
import { displayName, gradeLabel } from "@/lib/names";
import { parentConsentEnabled } from "@/server/policies/rules";

export const REQUEST_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_OPEN_REQUESTS = 5;
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export const createRequestSchema = z.object({
  subjectId: z.string().min(1, "Pick a subject"),
  description: z.string().trim().min(5, "Tell tutors a bit more about what you need").max(500),
});

/** Open = status open and not past expiry (the expiry job may not have run yet). */
const isOpen = () => ({ status: "open" as const, expiresAt: { gt: new Date() } });

/**
 * Learner posts a request. Approved tutors in the subject are notified: same-school tutors,
 * plus tutors at other schools who meet online (BACKEND.md › Journey B).
 */
export async function createRequest(learnerId: string, raw: z.input<typeof createRequestSchema>) {
  const input = createRequestSchema.parse(raw);
  const learner = await db.user.findUniqueOrThrow({ where: { id: learnerId } });
  if (!learner.roles.includes("learner")) throw new UserError("Only learners can post requests.");

  const subject = await db.subject.findUnique({ where: { id: input.subjectId } });
  if (!subject) throw new UserError("Pick a subject from the list.");

  const openCount = await db.helpRequest.count({ where: { learnerId, ...isOpen() } });
  if (openCount >= MAX_OPEN_REQUESTS) throw new UserError(`You can have up to ${MAX_OPEN_REQUESTS} open requests. Close one first.`);

  const request = await db.helpRequest.create({
    data: {
      learnerId,
      subjectId: subject.id,
      description: input.description,
      formats: learner.formats,
      expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    },
  });

  const tutors = await eligibleTutorsFor(learner.id, learner.schoolId, subject.id);
  const learnerLabel = learner.grade ? `${gradeLabel(learner.grade)} grader` : "student";
  for (const t of tutors) {
    await sendEmailSafely(
      newRequestEmail({ to: t.email, subject: subject.name, learnerLabel, description: input.description, url: `${appUrl()}/dashboard` }),
    );
  }
  return { request, notified: tutors.length };
}

/** Discoverable tutors for a subject that this learner can meet (same school, or online). */
async function eligibleTutorsFor(learnerId: string, learnerSchoolId: string | null, subjectId: string) {
  const tutors = await db.user.findMany({
    where: { ...discoverableTutor(), id: { not: learnerId }, tutorSubjects: { some: discoverableTutorSubject(subjectId) } },
    select: { id: true, email: true, schoolId: true, formats: true },
  });
  return tutors.filter((t) => effectiveFormats(t, learnerSchoolId).length > 0);
}

/** Learner's open requests with tutor responses, newest first. */
export async function myOpenRequests(learnerId: string) {
  const requests = await db.helpRequest.findMany({
    where: { learnerId, ...isOpen() },
    include: {
      subject: true,
      responses: { include: { tutor: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return requests.map((r) => ({
    id: r.id,
    subjectId: r.subjectId,
    subjectName: r.subject.name,
    description: r.description,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    responses: r.responses.map((x) => ({
      id: x.id,
      tutorId: x.tutor.id,
      tutorName: displayName(x.tutor.name),
      message: x.message,
      createdAt: x.createdAt,
    })),
  }));
}

/** Learner closes their own request (e.g. solved, or booked elsewhere). */
export async function closeRequest(learnerId: string, requestId: string) {
  const { count } = await db.helpRequest.updateMany({ where: { id: requestId, learnerId, status: "open" }, data: { status: "closed" } });
  if (count === 0) throw new UserError("That request is already closed.");
}

/**
 * A tutor replies to an open request. They must be approved for the subject, have parent
 * consent, not be paused, and be able to meet the learner (same school or online).
 */
export async function respondToRequest(tutorId: string, requestId: string, message: string) {
  const body = z.string().trim().min(2, "Write a short reply").max(500).parse(message);
  const request = await db.helpRequest.findFirst({
    where: { id: requestId, ...isOpen() },
    include: { learner: true, subject: true },
  });
  if (!request) throw new UserError("That request has closed or expired.");
  if (request.learnerId === tutorId) throw new UserError("You can't reply to your own request.");

  const tutor = await db.user.findFirst({
    where: { id: tutorId, ...discoverableTutor(), tutorSubjects: { some: discoverableTutorSubject(request.subjectId) } },
  });
  if (!tutor) {
    throw new UserError(`You need teacher approval for ${request.subject.name}${parentConsentEnabled() ? " (and parent consent)" : ""} to reply.`);
  }
  if (effectiveFormats(tutor, request.learner.schoolId).length === 0) {
    throw new UserError("This learner is at another school, so you'd need to offer online sessions.");
  }

  const existing = await db.requestResponse.findUnique({ where: { requestId_tutorId: { requestId, tutorId } } });
  if (existing) throw new UserError("You already replied to this request.");

  const response = await db.requestResponse.create({ data: { requestId, tutorId, message: body } });
  await sendEmailSafely(
    requestResponseEmail({
      to: request.learner.email,
      tutorName: displayName(tutor.name),
      subject: request.subject.name,
      message: body,
      url: `${appUrl()}/home`,
    }),
  );
  return response;
}

/**
 * Tutor dashboard › Open requests in your subjects: open requests in subjects the tutor is
 * approved for, from learners they can meet, that they haven't replied to or passed on.
 */
export async function tutorInbox(tutorId: string) {
  const tutor = await db.user.findFirst({
    where: { id: tutorId, ...discoverableTutor() },
    include: { tutorSubjects: { where: discoverableTutorSubject() } },
  });
  if (!tutor) return { eligible: false as const, requests: [] };

  const requests = await db.helpRequest.findMany({
    where: {
      ...isOpen(),
      subjectId: { in: tutor.tutorSubjects.map((ts) => ts.subjectId) },
      learnerId: { not: tutorId },
      responses: { none: { tutorId } },
      passes: { none: { tutorId } },
    },
    include: { subject: true, learner: { select: { name: true, grade: true, schoolId: true } } },
    orderBy: { createdAt: "asc" },
  });
  return {
    eligible: true as const,
    requests: requests
      .filter((r) => effectiveFormats(tutor, r.learner.schoolId).length > 0)
      .map((r) => {
        const formats = effectiveFormats(tutor, r.learner.schoolId).filter((f) => r.formats.length === 0 || r.formats.includes(f));
        return {
          id: r.id,
          subjectName: r.subject.name,
          description: r.description,
          learnerLabel: `${displayName(r.learner.name)}${r.learner.grade ? ` (${gradeLabel(r.learner.grade)})` : ""}`,
          formatText: formats.includes("in_person") && formats.includes("online") ? "In person or online" : formats.includes("in_person") ? "In person" : "Online",
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
        };
      }),
  };
}

/** Tutor hides a request from their inbox. */
export async function passRequest(tutorId: string, requestId: string) {
  const request = await db.helpRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new UserError("That request no longer exists.");
  await db.requestPass.upsert({ where: { requestId_tutorId: { requestId, tutorId } }, create: { requestId, tutorId }, update: {} });
}
