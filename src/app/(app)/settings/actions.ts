"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { toActionResult } from "@/server/errors";
import { requireOnboarded } from "@/server/policies/session";
import * as p from "@/server/services/profile";
import type { ClassInfo } from "@/lib/validation/onboarding";

async function run<T extends { toast: string }>(fn: (userId: string) => Promise<T>) {
  const user = await requireOnboarded();
  const result = await toActionResult(() => fn(user.id));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function updateBasicsAction(input: z.input<typeof p.basicsSchema>) {
  return run((id) => p.updateBasics(id, input));
}
export async function updateStaffNameAction(name: string) {
  return run((id) => p.updateStaffName(id, name));
}
export async function updateBioAction(bio: string) {
  return run((id) => p.updateBio(id, bio));
}
export async function setAvailabilityAction(cells: string[]) {
  return run((id) => p.setAvailability(id, cells));
}
export async function addLearnerSubjectAction(input: { subjectId?: string; customName?: string }) {
  return run((id) => p.addLearnerSubject(id, input));
}
export async function removeLearnerSubjectAction(subjectId: string) {
  return run((id) => p.removeLearnerSubject(id, subjectId));
}
export async function addTutorSubjectAction(input: z.input<typeof p.tutorSubjectSchema>) {
  return run((id) => p.addTutorSubject(id, input));
}
export async function removeTutorSubjectAction(tutorSubjectId: string) {
  return run((id) => p.removeTutorSubject(id, tutorSubjectId));
}
export async function updateParentAction(input: z.input<typeof p.parentSchema>) {
  return run((id) => p.updateParent(id, input));
}
export async function updateLearnerClassAction(subjectId: string, input: ClassInfo) {
  return run((id) => p.updateLearnerClass(id, subjectId, input));
}
export async function updateParentFyiAction(input: z.input<typeof p.parentFyiSchema>) {
  return run((id) => p.updateParentFyi(id, input));
}
