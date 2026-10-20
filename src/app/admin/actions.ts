"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { toActionResult } from "@/server/errors";
import { requireAdmin } from "@/server/policies/session";
import * as a from "@/server/services/admin";

async function run<T extends { toast: string }>(fn: (admin: { email: string }) => Promise<T>) {
  const admin = await requireAdmin();
  const result = await toActionResult(() => fn(admin));
  revalidatePath("/admin");
  return result;
}

export async function addDomainAction(schoolId: string, domain: string) {
  return run((admin) => a.addStaffDomain(admin, schoolId, domain));
}
export async function removeDomainAction(schoolId: string, domain: string) {
  return run((admin) => a.removeStaffDomain(admin, schoolId, domain));
}
export async function addSchoolAction(input: z.input<typeof a.newSchoolSchema>) {
  return run((admin) => a.addSchool(admin, input));
}
export async function verifyStaffRequestAction(entryId: string) {
  return run((admin) => a.verifyStaffRequest(admin, entryId));
}
export async function dismissWaitlistAction(entryId: string) {
  return run((admin) => a.resolveWaitlistEntry(admin, entryId, "dismissed"));
}
export async function markSchoolAddedAction(entryId: string) {
  return run((admin) => a.resolveWaitlistEntry(admin, entryId, "school_added"));
}
