import Link from "next/link";
import { ButtonLink, Card, Wordmark } from "@/components/ui/primitives";
import { parentConsentEnabled } from "@/server/policies/rules";

const steps = () => [
  {
    n: "01",
    title: "Sign up with your school",
    body: parentConsentEnabled() ? "A parent gives consent for students under 18." : "Pick your school and the classes you want help with or can teach.",
  },
  { n: "02", title: "Match by subject", body: "Only teacher-approved tutors show up." },
  { n: "03", title: "Meet in person or online", body: "Every online session gets its own one-time Meet link." },
];

export default function LandingPage() {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <header className="flex items-center justify-between py-[18px]">
        <Wordmark />
        <nav className="flex items-center gap-[18px]">
          <Link href="/for-schools">For schools</Link>
          <ButtonLink href="/login">Log in</ButtonLink>
        </nav>
      </header>

      <section className="flex max-w-[640px] flex-col gap-3.5 pt-12 pb-10 sm:pt-[72px]">
        <span className="kicker text-sm">Team Up, TierUp</span>
        <h1 className="text-[44px] leading-none sm:text-[64px]">Learn it from someone who just aced it.</h1>
        <p className="muted m-0 text-lg text-pretty">
          Students tutoring students, approved by your teachers. Meet in the library or online on a private, one-time
          Google Meet.
        </p>
      </section>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
        <Card blueprint kicker="I need help" className="gap-2.5 p-6">
          <div className="card-title text-[28px]">Find a tutor</div>
          <p className="m-0 flex-1 text-sm opacity-80">
            Browse, post a request, or let us match you by subject and schedule.
          </p>
          <ButtonLink href="/onboarding?role=learner" variant="primary" size="lg" blueprint className="self-start">
            Get help →
          </ButtonLink>
        </Card>
        <Card blueprint kicker="I want to tutor" className="gap-2.5 p-6">
          <div className="card-title text-[28px]">Earn service hours</div>
          <p className="m-0 flex-1 text-sm opacity-80">
            Teach a subject you got an A in. Your teachers sign off on your hours.
          </p>
          <ButtonLink href="/onboarding?role=tutor" size="lg" className="self-start">
            Become a tutor →
          </ButtonLink>
        </Card>
      </section>

      <section className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6 border-t border-divider pt-12">
        {steps().map((s) => (
          <div key={s.n} className="flex flex-col gap-1">
            <span className="kicker">{s.n}</span>
            <b className="h text-xl">{s.title}</b>
            <span className="muted text-sm">{s.body}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
