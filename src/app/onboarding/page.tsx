import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExitLink, PublicHeader } from "@/components/app/public-header";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { homePathFor, requireUser } from "@/server/policies/session";
import { schoolGroups, subjectGroups } from "@/server/services/catalog";
import { firstName } from "@/lib/names";

export const metadata: Metadata = { title: "Sign up" };

type Props = { searchParams: Promise<{ role?: string }> };

export default async function OnboardingPage({ searchParams }: Props) {
  const { role } = await searchParams;
  const user = await requireUser(`/onboarding${role ? `?role=${encodeURIComponent(role)}` : ""}`);
  if (user.onboardedAt) redirect(homePathFor(user));

  const [schools, subjects] = await Promise.all([schoolGroups(), subjectGroups()]);
  const nameParts = user.name?.trim().split(/\s+/) ?? [];

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <PublicHeader right={<ExitLink />} />
      <OnboardingWizard
        initialRole={role === "tutor" ? "tutor" : "learner"}
        initialFirstName={firstName(user.name)}
        initialLastName={nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""}
        accountEmail={user.email}
        schoolGroups={schools}
        subjectGroups={subjects}
      />
    </main>
  );
}
