import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/app/public-header";
import { ButtonLink, Card } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "For schools" };

const POINTS = [
  { n: "01", title: "You approve every tutor", body: "Students name a teacher per subject. You approve, and can revoke at any time." },
  { n: "02", title: "Every chat is visible to staff", body: "Session logs, Meet links and reports, all scoped to your school." },
  { n: "03", title: "Service hours, signed off", body: "Tutors log hours per session. Approve them in one place and export the log." },
];

export default function ForSchoolsPage() {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <PublicHeader right={<ButtonLink href="/login">Log in</ButtonLink>} />
      <section className="flex max-w-[640px] flex-col gap-3.5 pt-12 pb-10">
        <span className="kicker text-sm">For teachers &amp; staff</span>
        <h1 className="text-[44px] leading-none sm:text-[56px]">Peer tutoring your school can trust.</h1>
        <p className="muted m-0 text-lg text-pretty">
          Sign up with your school email. The first teacher to join opens TierUp for your students.
        </p>
      </section>
      <Card blueprint kicker="Teachers" className="max-w-[560px] gap-2.5 p-6">
        <div className="card-title text-[28px]">Set up your school</div>
        <p className="m-0 text-sm opacity-80">
          Sign in with your school Google account or school email. We check that it matches your school&apos;s domain.
        </p>
        <ButtonLink href="/login?callbackUrl=/onboarding/staff" variant="primary" size="lg" blueprint className="self-start">
          Sign up as staff →
        </ButtonLink>
      </Card>
      <section className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6 border-t border-divider pt-12">
        {POINTS.map((s) => (
          <div key={s.n} className="flex flex-col gap-1">
            <span className="kicker">{s.n}</span>
            <b className="h text-xl">{s.title}</b>
            <span className="muted text-sm">{s.body}</span>
          </div>
        ))}
      </section>
      <p className="muted mt-10 text-[13px]">
        Looking for help as a student? <Link href="/">Go to the student page</Link>.
      </p>
    </main>
  );
}
