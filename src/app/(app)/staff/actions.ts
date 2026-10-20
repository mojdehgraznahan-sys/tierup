"use server";

import { revalidatePath } from "next/cache";
import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import * as m from "@/server/services/moderation";
import * as ss from "@/server/services/school-settings";
import type { z } from "zod";

type Toast = { toast: string };

async function run(fn: (staff: Awaited<ReturnType<typeof requireOnboarded>>) => Promise<Toast>) {
  const staff = await requireOnboarded(["staff"]);
  const result = await toActionResult(() => fn(staff));
  revalidatePath("/staff");
  return result;
}

export async function approveSubjectAction(id: string) {
  return run((s) => m.approveTutorSubject(s, id));
}

export async function revokeSubjectAction(id: string) {
  return run((s) => m.revokeTutorSubject(s, id));
}

export async function approveHoursAction(id: string) {
  return run((s) => m.approveHours(s, id));
}

export async function rejectHoursAction(id: string) {
  return run((s) => m.rejectHours(s, id));
}

export async function approveAllConfirmedAction() {
  return run((s) => m.approveAllConfirmed(s));
}

export async function dismissReportAction(id: string) {
  return run((s) => m.dismissReport(s, id));
}

export async function warnReportAction(id: string) {
  return run((s) => m.warnReported(s, id));
}

export async function pauseTutorAction(id: string) {
  return run((s) => m.pauseReportedTutor(s, id));
}

export async function unpauseTutorAction(id: string) {
  return run((s) => m.unpauseTutor(s, id));
}

export async function notifyParentsAction(id: string) {
  return run((s) => m.notifyParents(s, id));
}



export async function setGoalAction(goal: number) {
  return run((s) => ss.setServiceHourGoal(s, goal));
}
export async function setSpacesAction(spaces: string[]) {
  return run((s) => ss.setSpaces(s, spaces));
}
export async function addSlotAction(input: z.input<typeof ss.slotSchema>) {
  return run((s) => ss.addSlot(s, input));
}
export async function updateSlotAction(slotId: string, input: z.input<typeof ss.slotSchema>) {
  return run((s) => ss.updateSlot(s, slotId, input));
}
export async function removeSlotAction(slotId: string) {
  return run((s) => ss.removeSlot(s, slotId));
}
export async function setTutorCapAction(tutorId: string, cap: number) {
  return run((s) => ss.setTutorCap(s, tutorId, cap));
}
