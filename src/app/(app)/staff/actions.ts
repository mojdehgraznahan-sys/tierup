"use server";

import { revalidatePath } from "next/cache";
import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import * as m from "@/server/services/moderation";

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

