import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicHeader } from "@/components/app/public-header";
import { Button, Card, Tag } from "@/components/ui/primitives";
import { decideConsent, getConsentByToken } from "@/server/services/consent";
import { parentConsentEnabled } from "@/server/policies/rules";
import { displayName, gradeLabel } from "@/lib/names";

export const metadata: Metadata = { title: "Parent consent", robots: { index: false } };

type Props = { params: Promise<{ token: string }> };

const SAFETY = [
  "Tutors are students approved by a teacher for each subject they teach.",
  "In-person sessions happen only in approved school spaces.",
  "Online sessions use a private, one-time Google Meet that only your child and their tutor can join.",
  "School staff can see every chat and session, and anyone can report a problem.",
];

export default async function ConsentPage({ params }: Props) {
  if (!parentConsentEnabled()) notFound();
  const { token } = await params;
  const consent = await getConsentByToken(token);
  if (!consent) notFound();

  const { student } = consent;
  const name = displayName(student.name);
  const tutor = student.roles.includes("tutor");

  async function decide(formData: FormData) {
    "use server";
    const decision = formData.get("decision") === "approved" ? "approved" : "declined";
    await decideConsent(token, decision);
    redirect(`/consent/${token}`);
  }

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <PublicHeader />
      <div className="mx-auto flex max-w-[560px] flex-col gap-6 pt-8">
        <div className="flex flex-col gap-2">
          <span className="kicker">Parent or guardian consent</span>
          <h1 className="text-[34px] sm:text-[40px]">
            {name} wants to {tutor ? "tutor on" : "get help on"} TierUp
          </h1>
          <p className="muted m-0">
            {[gradeLabel(student.grade) && `${gradeLabel(student.grade)} grade`, student.school?.name].filter(Boolean).join(" · ")}
          </p>
        </div>

        <Card blueprint kicker="How TierUp keeps students safe" className="gap-3 p-6">
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {SAFETY.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="text-accent-700">✓</span>
                {s}
              </li>
            ))}
          </ul>
          <p className="muted m-0 text-sm">
            {tutor
              ? "Tutors earn volunteer service hours that their teachers sign off on."
              : "You'll get an email whenever they book a session"}
            {!tutor && (consent.sendSummaries ? ", plus a short summary after each one." : ".")}
          </p>
        </Card>

        {consent.status === "pending" ? (
          <form action={decide} className="flex flex-wrap gap-3">
            <Button type="submit" name="decision" value="approved" variant="primary" size="lg">
              I approve
            </Button>
            <Button type="submit" name="decision" value="declined" size="lg">
              Decline
            </Button>
          </form>
        ) : (
          <Card className="gap-3 p-5">
            <div className="flex items-center gap-3">
              <Tag tone={consent.status === "approved" ? "accent" : "outline"}>
                {consent.status === "approved" ? "✓ Approved" : "Declined"}
              </Tag>
              <span className="text-sm">
                {consent.status === "approved"
                  ? `Thanks! ${name} can now ${tutor ? "tutor once a teacher approves their subjects" : "book sessions"}.`
                  : `${name} can browse, but can't book or tutor.`}
              </span>
            </div>
            <form action={decide}>
              <Button
                type="submit"
                name="decision"
                value={consent.status === "approved" ? "declined" : "approved"}
                variant="ghost"
                className="text-[13px]"
              >
                {consent.status === "approved" ? "Withdraw consent" : "Change my answer: approve"}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
