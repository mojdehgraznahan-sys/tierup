"use server";

import { redirect } from "next/navigation";
import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import { createBooking, type bookingSchema } from "@/server/services/booking";
import type { z } from "zod";

export async function createBookingAction(input: z.input<typeof bookingSchema>) {
  const user = await requireOnboarded(["learner"]);
  const result = await toActionResult(() => createBooking(user.id, input));
  if (!result.ok) return result;
  redirect(`/booked/${result.sessionId}`);
}
