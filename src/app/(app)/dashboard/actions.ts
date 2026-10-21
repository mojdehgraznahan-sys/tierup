"use server";

import { revalidatePath } from "next/cache";
import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import { logHours, unlogHours } from "@/server/services/hours";
import { passRequest, respondToRequest } from "@/server/services/requests";
import { resendApprovalRequest } from "@/server/services/approval-notifications";

export async function setHoursLoggedAction(sessionId: string, logged: boolean) {
  const user = await requireOnboarded(["tutor"]);
  const result = await toActionResult(() => (logged ? logHours(user.id, sessionId) : unlogHours(user.id, sessionId)));
  revalidatePath("/dashboard");
  return result;
}

export async function replyToRequestAction(requestId: string, message: string) {
  const user = await requireOnboarded(["tutor"]);
  const result = await toActionResult(async () => {
    await respondToRequest(user.id, requestId, message);
    return { toast: "Reply sent. They can book a time with you from it." };
  });
  if (result.ok) revalidatePath("/dashboard");
  return result;
}

export async function passRequestAction(requestId: string) {
  const user = await requireOnboarded(["tutor"]);
  const result = await toActionResult(async () => {
    await passRequest(user.id, requestId);
    return { toast: "Passed" };
  });
  if (result.ok) revalidatePath("/dashboard");
  return result;
}

export async function resendApprovalAction(tutorSubjectId: string) {
  const user = await requireOnboarded(["tutor"]);
  const result = await toActionResult(() => resendApprovalRequest(user.id, tutorSubjectId));
  revalidatePath("/dashboard");
  return result;
}
