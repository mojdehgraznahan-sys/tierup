import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { sendEmailSafely } from "@/server/email/send";
import { sessionCancelledEmail, sessionConfirmedEmail, sessionSummaryEmail } from "@/server/email/templates";
import { getMeetProvider } from "@/server/integrations/meet";
import { sessionWhen } from "@/server/services/sessions";
import { parentEmailFor } from "@/server/policies/rules";
import { displayName } from "@/lib/names";
import { LOW_RATING, REVIEW_TAGS } from "@/lib/review";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export const reviewSchema = z
  .object({
    happened: z.enum(["yes", "cut_short", "no_show"]),
    stars: z.number().int().min(1).max(5).optional(),
    tags: z.array(z.enum(REVIEW_TAGS)).max(REVIEW_TAGS.length).default([]),
    comment: z.string().trim().max(1000).optional(),
  })
  .refine((r) => r.happened === "no_show" || r.stars !== undefined, { message: "Pick at least 1 star", path: ["stars"] });

async function loadSession(sessionId: string) {
  return db.tutoringSession.findUnique({
    where: { id: sessionId },
    include: {
      subject: true,
      tutor: true,
      learner: { include: { consent: true, school: { include: { slots: true } } } },
      review: true,
    },
  });
}

function when(s: NonNullable<Awaited<ReturnType<typeof loadSession>>>) {
  return sessionWhen(s.startsAt, new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label])));
}

/**
 * "Mark complete & review" (learner only, once the session has started). A review that says the
 * session happened counts as learner confirmation for service hours. No-shows and low ratings are
 * also sent privately to staff.
 */
export async function completeAndReview(learnerId: string, sessionId: string, raw: z.input<typeof reviewSchema>, now = new Date()) {
  const input = reviewSchema.parse(raw);
  const s = await loadSession(sessionId);
  if (!s || s.learnerId !== learnerId) throw new UserError("You can only review your own sessions.");
  if (s.status !== "confirmed" || s.review) throw new UserError("This session has already been wrapped up.");
  if (s.startsAt > now) throw new UserError("You can mark it complete once the session has started.");

  const happened = input.happened !== "no_show";
  const tutorName = displayName(s.tutor.name);
  const learnerName = displayName(s.learner.name);

  await db.$transaction(async (tx) => {
    // Conditional, so a double submit (two tabs, double click) gets a clear error instead of a crash.
    const { count } = await tx.tutoringSession.updateMany({
      where: { id: s.id, status: "confirmed" },
      data: { status: happened ? "completed" : "no_show", learnerConfirmedAt: happened ? now : null },
    });
    if (count === 0) throw new UserError("This session has already been wrapped up.");
    await tx.review.create({
      data: {
        sessionId: s.id,
        learnerId,
        happened: input.happened,
        stars: happened ? input.stars! : null,
        tags: happened ? input.tags : [],
        comment: input.comment || null,
      },
    });
    const lowRating = happened && input.stars! <= LOW_RATING;
    if (!happened || lowRating) {
      await tx.report.create({
        data: {
          automatic: true,
          reporterId: learnerId,
          againstUserId: s.tutorId,
          sessionId: s.id,
          threadId: s.threadId,
          reason: happened
            ? `Low rating (${input.stars}★)${input.comment ? `: ${input.comment}` : ""}`
            : `Learner says the tutor didn't show up${input.comment ? `: ${input.comment}` : ""}`,
        },
      });
    }
  });

  const hours = (s.durationMin / 60).toString();
  if (happened) {
    await sendEmailSafely(
      sessionConfirmedEmail({ to: s.tutor.email, learnerName, subject: s.subject.name, when: when(s), hours, url: `${appUrl()}/dashboard` }),
    );
  }
  const summaryTo = s.learner.consent?.sendSummaries ? parentEmailFor(s.learner.consent) : null;
  if (summaryTo) {
    await sendEmailSafely(
      sessionSummaryEmail({
        to: summaryTo,
        studentName: learnerName,
        tutorName,
        subject: s.subject.name,
        when: when(s),
        happened: { yes: "The session happened as planned.", cut_short: "The session was cut short.", no_show: "The tutor didn't show up; school staff have been told." }[input.happened],
        notes: s.tutorNotes,
      }),
    );
  }

  return {
    toast: happened
      ? `Thanks! ${tutorName} can now log their ${hours} hrs for teacher sign-off`
      : "Thanks for letting us know. School staff have been told.",
  };
}

export const tutorWrapUpSchema = z.object({
  learnerShowedUp: z.boolean(),
  feedback: z.string().trim().max(1000).optional(),
});

/**
 * Tutor's side of the wrap-up (once the session has started): did the learner show up, plus
 * optional feedback that only school staff see. A learner no-show ends the session without
 * service hours and tells staff; if the learner already confirmed it happened, the session is
 * left as is and staff are told about the disagreement.
 */
export async function tutorWrapUp(tutorId: string, sessionId: string, raw: z.input<typeof tutorWrapUpSchema>, now = new Date()) {
  const { learnerShowedUp, feedback } = tutorWrapUpSchema.parse(raw);
  const s = await loadSession(sessionId);
  if (!s || s.tutorId !== tutorId) throw new UserError("You can only wrap up your own sessions.");
  if (s.startsAt > now) throw new UserError("You can wrap up once the session has started.");
  if (s.tutorWrappedUpAt) throw new UserError("You've already wrapped up this session.");
  if (s.status !== "confirmed" && s.status !== "completed") throw new UserError("This session can't be wrapped up.");

  const learnerName = displayName(s.learner.name);
  // A no-show the learner hasn't contradicted ends the session; otherwise the status stays.
  const endsSession = !learnerShowedUp && s.status === "confirmed";

  await db.$transaction(async (tx) => {
    // Conditional on the status we checked, so a learner review landing at the same time can't be overwritten.
    const { count } = await tx.tutoringSession.updateMany({
      where: { id: s.id, status: s.status, tutorWrappedUpAt: null },
      data: {
        learnerShowedUp,
        tutorFeedback: feedback || null,
        tutorWrappedUpAt: now,
        ...(endsSession ? { status: "no_show" as const } : {}),
      },
    });
    if (count === 0) throw new UserError("This session changed while you were wrapping up. Reload and try again.");
    if (learnerShowedUp) return;

    // No hours for a session that didn't happen; approved or rejected logs are staff's call.
    await tx.hourLog.deleteMany({ where: { sessionId: s.id, status: "logged" } });
    await tx.report.create({
      data: {
        automatic: true,
        reporterId: tutorId,
        againstUserId: s.learnerId,
        sessionId: s.id,
        threadId: s.threadId,
        reason:
          (endsSession
            ? "Tutor says the learner didn't show up"
            : `Tutor says the learner didn't show up, but ${learnerName} confirmed the session happened`) + (feedback ? `: ${feedback}` : ""),
      },
    });
  });

  return {
    toast: learnerShowedUp ? "Thanks! Your wrap-up is saved." : "Thanks for letting us know. School staff have been told.",
  };
}

export const cancelSchema =z.object({ reason: z.string().trim().max(300).optional() });

/**
 * Either participant cancels a confirmed session before it starts. The calendar event (and its
 * Meet) is removed so the link can't be used, and the other person and the learner's parent hear.
 */
export async function cancelSession(userId: string, sessionId: string, raw: z.input<typeof cancelSchema>, now = new Date()) {
  const { reason } = cancelSchema.parse(raw);
  const s = await loadSession(sessionId);
  if (!s || (s.learnerId !== userId && s.tutorId !== userId)) throw new UserError("You can only cancel your own sessions.");
  if (s.status !== "confirmed") throw new UserError("This session can't be cancelled anymore.");
  if (s.startsAt <= now) throw new UserError("This session has already started.");

  const { count } = await db.tutoringSession.updateMany({
    where: { id: s.id, status: "confirmed" },
    data: { status: "cancelled", cancelledAt: now, cancelledById: userId, cancelReason: reason || null },
  });
  if (count === 0) throw new UserError("This session can't be cancelled anymore.");

  if (s.calendarEventId || s.meetSpaceName) {
    try {
      await (await getMeetProvider()).cancelMeeting({ calendarEventId: s.calendarEventId, spaceName: s.meetSpaceName, organizer: s.meetOrganizer });
    } catch (err) {
      // The session is cancelled either way; the Join button is already gone. Log for follow-up.
      console.error(`Couldn't cancel the calendar event for session ${s.id}`, err);
    }
  }

  const byLearner = userId === s.learnerId;
  const byName = displayName(byLearner ? s.learner.name : s.tutor.name);
  const url = `${appUrl()}/sessions/${s.threadId}`;
  const email = (to: string) => sessionCancelledEmail({ to, byName, subject: s.subject.name, when: when(s), reason: reason || null, url });
  await sendEmailSafely(email(byLearner ? s.tutor.email : s.learner.email));
  const parentTo = parentEmailFor(s.learner.consent);
  if (parentTo) await sendEmailSafely(email(parentTo));

  return { toast: "Session cancelled. We let everyone know." };
}

/** Tutor's private notes on a session (shared in the parent's summary if they opted in). */
export async function saveTutorNotes(tutorId: string, sessionId: string, notes: string, now = new Date()) {
  const body = z.string().trim().max(2000).parse(notes);
  const s = await db.tutoringSession.findUnique({ where: { id: sessionId } });
  if (!s || s.tutorId !== tutorId) throw new UserError("You can only add notes to your own sessions.");
  if (s.status === "cancelled") throw new UserError("This session was cancelled.");
  if (s.startsAt > now) throw new UserError("You can add notes once the session has started.");
  await db.tutoringSession.update({ where: { id: s.id }, data: { tutorNotes: body || null } });
  return { toast: s.status === "confirmed" ? "Notes saved. Waiting for the learner to confirm." : "Notes saved." };
}
