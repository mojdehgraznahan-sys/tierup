"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import { cancelSession, completeAndReview, saveTutorNotes, type reviewSchema } from "@/server/services/lifecycle";
import { sendMessage } from "@/server/services/messaging";

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
