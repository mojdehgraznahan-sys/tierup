"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import { cancelSession, completeAndReview, saveTutorNotes, tutorWrapUp, type reviewSchema, type tutorWrapUpSchema } from "@/server/services/lifecycle";
import { sendMessage } from "@/server/services/messaging";
import { addMicClip, stopTranscribing } from "@/server/services/transcripts";
import { UserError } from "@/server/errors";

export async function sendMessageAction(threadId: string, body: string) {
  const user = await requireOnboarded(["learner", "tutor"]);
  return toActionResult(async () => ({ message: await sendMessage(user, threadId, body) }));
}

export async function completeAndReviewAction(sessionId: string, input: z.input<typeof reviewSchema>) {
  const user = await requireOnboarded(["learner"]);
  const result = await toActionResult(() => completeAndReview(user.id, sessionId, input));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function tutorWrapUpAction(sessionId: string, input: z.input<typeof tutorWrapUpSchema>) {
  const user = await requireOnboarded(["tutor"]);
  const result = await toActionResult(() => tutorWrapUp(user.id, sessionId, input));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function cancelSessionAction(sessionId: string, reason?: string) {
  const user = await requireOnboarded(["learner", "tutor"]);
  const result = await toActionResult(() => cancelSession(user.id, sessionId, { reason }));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function saveTutorNotesAction(sessionId: string, notes: string) {
  const user = await requireOnboarded(["tutor"]);
  return toActionResult(() => saveTutorNotes(user.id, sessionId, notes));
}

/** One ~30 s audio clip from the session page's mic capture; transcribed and discarded. */
export async function uploadTranscriptClipAction(sessionId: string, form: FormData) {
  const user = await requireOnboarded(["learner", "tutor"]);
  return toActionResult(async () => {
    const clip = form.get("clip");
    if (!(clip instanceof Blob)) throw new UserError("No audio in that clip.");
    const startedAt = new Date(Number(form.get("startedAt")) || Date.now());
    return addMicClip(user.id, sessionId, Buffer.from(await clip.arrayBuffer()), clip.type || "audio/webm", startedAt);
  });
}

export async function stopTranscribingAction(sessionId: string) {
  const user = await requireOnboarded(["learner", "tutor"]);
  const result = await toActionResult(() => stopTranscribing(user.id, sessionId));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
