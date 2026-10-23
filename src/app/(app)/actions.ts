"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { toActionResult, UserError } from "@/server/errors";
import { parentConsentEnabled } from "@/server/policies/rules";
import { requireOnboarded } from "@/server/policies/session";
import { resendConsent } from "@/server/services/consent";
import { recordConsents } from "@/server/services/privacy-consent";
import { stopTranscribingUpcoming } from "@/server/services/transcripts";
import { revalidatePath } from "next/cache";
import { MODE_COOKIE } from "@/components/app/mode";

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

/** Learner/Tutor mode switch for students who hold both roles. */
export async function switchMode(mode: "learner" | "tutor") {
  const user = await requireOnboarded([mode]);
  (await cookies()).set(MODE_COOKIE, mode, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect(mode === "tutor" ? "/dashboard" : user.roles.includes("learner") ? "/home" : "/dashboard");
}

export async function resendConsentAction() {
  const user = await requireOnboarded(["learner", "tutor"]);
  return toActionResult(async () => {
    if (!parentConsentEnabled()) throw new UserError("Parent consent isn't needed right now.");
    await resendConsent(user.id);
    return { toast: "Consent link sent to your parent again" };
  });
}

/** The privacy pop-up and Settings: transcription and de-identified analytics, each opt-in. */
export async function savePrivacyAction(input: { transcripts?: boolean; analytics: boolean }) {
  const user = await requireOnboarded(["learner", "tutor"]);
  const result = await toActionResult(() => recordConsents(user.id, input));
  if (result.ok && input.transcripts === false) await stopTranscribingUpcoming(user.id);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
