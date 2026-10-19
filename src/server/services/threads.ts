import "server-only";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { discoverableTutor, discoverableTutorSubject, effectiveFormats } from "@/server/policies/discoverability";

/**
 * Opens (or reuses) the learner's pre-booking chat with a tutor about a subject.
 * When `seedResponseId` is given (Message on a request reply), the tutor's reply becomes the
 * first message of a new thread.
 */
export async function getOrCreatePreBookingThread(
  learnerId: string,
  opts: { tutorId: string; subjectId?: string; seedResponseId?: string },
) {
  const learner = await db.user.findUniqueOrThrow({ where: { id: learnerId } });
  if (!learner.roles.includes("learner")) throw new UserError("Only learners can start a chat with a tutor.");
  if (opts.tutorId === learnerId) throw new UserError("You can't message yourself.");

  const tutor = await db.user.findFirst({
    where: { id: opts.tutorId, ...discoverableTutor() },
    include: { tutorSubjects: { where: discoverableTutorSubject(), orderBy: { subject: { name: "asc" } } } },
  });
  if (!tutor || tutor.tutorSubjects.length === 0 || effectiveFormats(tutor, learner.schoolId).length === 0) {
    throw new UserError("This tutor isn't available right now.");
  }

  // Use the requested subject if the tutor is approved in it, else a subject the learner takes, else their first.
  const approved = tutor.tutorSubjects.map((ts) => ts.subjectId);
  let subjectId = opts.subjectId && approved.includes(opts.subjectId) ? opts.subjectId : undefined;
  if (!subjectId) {
    const mine = await db.learnerSubject.findFirst({ where: { userId: learnerId, subjectId: { in: approved } } });
    subjectId = mine?.subjectId ?? approved[0]!;
  }

  const existing = await db.thread.findFirst({
    where: { learnerId, tutorId: tutor.id, subjectId, session: { is: null } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const seed = opts.seedResponseId
    ? await db.requestResponse.findFirst({
        where: { id: opts.seedResponseId, tutorId: tutor.id, request: { learnerId } },
      })
    : null;

  return db.thread.create({
    data: {
      learnerId,
      tutorId: tutor.id,
      subjectId,
      messages: seed ? { create: { senderId: tutor.id, body: seed.message, createdAt: seed.createdAt } } : undefined,
    },
  });
}
