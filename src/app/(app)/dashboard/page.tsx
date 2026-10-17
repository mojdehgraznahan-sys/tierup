import type { Metadata } from "next";
import { ConsentBanner } from "@/components/app/consent-banner";
import { Card, Tag } from "@/components/ui/primitives";
import { db } from "@/server/db";
import { requireOnboarded } from "@/server/policies/session";
import { firstName } from "@/lib/names";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS = {
  pending: { label: "Waiting for teacher", tone: "neutral" },
  approved: { label: "✓ Approved", tone: "accent" },
  revoked: { label: "Revoked", tone: "outline" },
} as const;

function endorserLine(status: keyof typeof STATUS, teacher?: string | null) {
  if (!teacher) return "";
  if (status === "pending") return `Waiting on ${teacher}`;
  return status === "approved" ? `Approved by ${teacher}` : `Revoked by ${teacher}`;
}

export default async function TutorDashboardPage() {
  const user = await requireOnboarded(["tutor"]);
  const subjects = await db.tutorSubject.findMany({
    where: { tutorId: user.id },
    include: { subject: true, endorser: true },
    orderBy: { subject: { name: "asc" } },
  });
  const consent = user.consent;

  return (
    <div className="flex flex-col gap-6">
      <div className="pt-8">
        <h1>Hey {firstName(user.name)}</h1>
      </div>

      {consent && consent.status !== "approved" && (
        <ConsentBanner status={consent.status} parentEmail={consent.parentEmail} blocked="tutor" />
      )}

      <Card blueprint kicker="Your subjects" className="gap-0">
        {subjects.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-divider py-2.5 first-of-type:border-t-0">
            <div className="flex flex-col">
              <b className="h text-lg">{s.subject.name}</b>
              <span className="card-meta">
                {endorserLine(s.status, s.endorser?.name ?? s.endorserEmail)}
              </span>
            </div>
            <Tag tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Tag>
          </div>
        ))}
        <p className="muted m-0 pt-3 text-[13px]">
          You show up to learners for a subject once your parent has consented and a teacher approves it.
        </p>
      </Card>
    </div>
  );
}
