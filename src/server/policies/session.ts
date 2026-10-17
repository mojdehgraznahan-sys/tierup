import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { db } from "@/server/db";
import { homePathFor } from "./rules";

export { hasParentConsent, homePathFor, safeCallbackPath } from "./rules";

/** The signed-in user with their school and consent, or null. Cached per request. */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return db.user.findUnique({
    where: { id },
    include: { school: true, consent: true, tutorStatus: true },
  });
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(callbackPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const qs = callbackPath ? `?callbackUrl=${encodeURIComponent(callbackPath)}` : "";
    redirect(`/login${qs}`);
  }
  return user;
}

/** Signed in and finished onboarding; optionally holding one of `roles`. */
export async function requireOnboarded(roles?: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.onboardedAt) redirect("/onboarding");
  if (roles && !roles.some((r) => user.roles.includes(r))) redirect(homePathFor(user));
  return user;
}
