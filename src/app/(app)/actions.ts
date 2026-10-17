"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import { resendConsent } from "@/server/services/consent";
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
    await resendConsent(user.id);
    return { toast: "Consent link sent to your parent again" };
  });
}
