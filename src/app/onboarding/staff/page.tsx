import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExitLink, PublicHeader } from "@/components/app/public-header";
import { StaffOnboardingForm } from "@/components/onboarding/staff-form";
import { Button } from "@/components/ui/primitives";
import { signOutAction } from "@/app/(app)/actions";
import { homePathFor, requireUser } from "@/server/policies/session";
import { schoolGroups } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Staff sign-up" };

export default async function StaffOnboardingPage() {
  const user = await requireUser("/onboarding/staff");
  if (user.onboardedAt && user.roles.includes("staff")) redirect(homePathFor(user));

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <PublicHeader right={<ExitLink href="/for-schools" />} />
      <div className="flex max-w-[560px] flex-col gap-[18px] border-t border-divider py-9">
        <span className="kicker">Staff sign-up</span>
        <h2>Which school do you teach at?</h2>
        {user.onboardedAt ? (
          <>
            <p className="m-0">
              You&apos;re signed in as <b>{user.email}</b>, which is a student account. Sign out, then sign in with
              your school staff email.
            </p>
            <form action={signOutAction}>
              <Button type="submit">Sign out</Button>
            </form>
          </>
        ) : (
          <StaffOnboardingForm schoolGroups={await schoolGroups()} accountEmail={user.email} defaultName={user.name ?? ""} />
        )}
      </div>
    </main>
  );
}
