"use server";

import { toActionResult } from "@/server/errors";
import { requireUser } from "@/server/policies/session";
import { becomeStaff, completeOnboarding } from "@/server/services/onboarding";
import type { OnboardingInput, StaffOnboardingInput } from "@/lib/validation/onboarding";

export async function finishOnboarding(input: OnboardingInput) {
  const user = await requireUser();
  return toActionResult(() => completeOnboarding(user.id, input));
}

export async function finishStaffOnboarding(input: StaffOnboardingInput) {
  const user = await requireUser();
  return toActionResult(() => becomeStaff(user.id, input));
}
