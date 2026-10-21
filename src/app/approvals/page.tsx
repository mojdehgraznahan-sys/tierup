import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/(app)/actions";
import { PublicHeader } from "@/components/app/public-header";
import { Button, Card } from "@/components/ui/primitives";
import { getCurrentUser } from "@/server/policies/session";

export const metadata: Metadata = { title: "Tutor approvals", robots: { index: false } };

type Props = { searchParams: Promise<{ tutor?: string }> };

/**
 * Where approval emails link. Gets the teacher to Moderation › Tutor approvals for this student:
 * signing in, or finishing staff sign-up, first if needed.
 */
export default async function ApprovalsEntry({ searchParams }: Props) {
  const { tutor } = await searchParams;
  const tutorId = tutor && /^[a-z0-9]{10,40}$/i.test(tutor) ? tutor : undefined;
  const target = `/staff?tab=approvals${tutorId ? `&tutor=${tutorId}` : ""}`;
  const self = `/approvals${tutorId ? `?tutor=${tutorId}` : ""}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(self)}`);
  if (user.roles.includes("staff")) redirect(target);
  if (!user.onboardedAt) redirect(`/onboarding/staff?next=${encodeURIComponent(target)}`);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <PublicHeader />
      <Card blueprint kicker="Tutor approvals" className="mx-auto mt-10 max-w-[520px] gap-3 p-6">
        <h2 className="text-2xl">This link is for teachers</h2>
        <p className="muted m-0 text-sm">
          You&apos;re signed in as <b>{user.email}</b>, a student account. Sign out, then open the link again and sign in with
          your school staff email.
        </p>
        <form action={signOutAction}>
          <Button type="submit">Sign out</Button>
        </form>
      </Card>
    </main>
  );
}
