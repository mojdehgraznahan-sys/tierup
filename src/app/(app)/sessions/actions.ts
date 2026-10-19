"use server";

import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import { sendMessage } from "@/server/services/messaging";

export async function sendMessageAction(threadId: string, body: string) {
  const user = await requireOnboarded(["learner", "tutor"]);
  return toActionResult(async () => ({ message: await sendMessage(user, threadId, body) }));
}
