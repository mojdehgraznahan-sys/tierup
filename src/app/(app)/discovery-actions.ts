"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import { closeRequest, createRequest } from "@/server/services/requests";
import { createReport, type reportSchema } from "@/server/services/reports";
import { getOrCreatePreBookingThread } from "@/server/services/threads";
import type { z } from "zod";

export async function postRequestAction(input: { subjectId: string; description: string }) {
  const user = await requireOnboarded(["learner"]);
  const result = await toActionResult(async () => {
    const { notified } = await createRequest(user.id, input);
    return { notified, toast: "Request posted to approved tutors" };
  });
  if (result.ok) revalidatePath("/home");
  return result;
}

export async function closeRequestAction(requestId: string) {
  const user = await requireOnboarded(["learner"]);
  const result = await toActionResult(async () => {
    await closeRequest(user.id, requestId);
    return { toast: "Request closed" };
  });
  if (result.ok) revalidatePath("/home");
  return result;
}

/** Message button: open (or create) the pre-booking chat and go to it. */
export async function messageTutorAction(input: { tutorId: string; subjectId?: string; seedResponseId?: string }) {
  const user = await requireOnboarded(["learner"]);
  const result = await toActionResult(async () => ({ thread: await getOrCreatePreBookingThread(user.id, input) }));
  if (!result.ok) return result;
  redirect(`/sessions/${result.thread.id}`);
}

export async function reportAction(input: z.input<typeof reportSchema>) {
  const user = await requireOnboarded();
  return toActionResult(async () => {
    await createReport(user.id, input);
    return { toast: "Report sent to school staff. Thanks for flagging it." };
  });
}
