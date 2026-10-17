import type { Metadata } from "next";
import { ConsentBanner } from "@/components/app/consent-banner";
import { ButtonLink, Card, Tag } from "@/components/ui/primitives";
import { db } from "@/server/db";
import { requireOnboarded } from "@/server/policies/session";
import { longDate } from "@/lib/time";
import { firstName } from "@/lib/names";

export const metadata: Metadata = { title: "Home" };

export default async function StudentHomePage() {
  const user = await requireOnboarded(["learner"]);
  const subjects = await db.learnerSubject.findMany({
    where: { userId: user.id },
    include: { subject: true },
    orderBy: { subject: { name: "asc" } },
  });
  const consent = user.consent;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
        <div>
          <span className="kicker">{longDate(new Date())}</span>
          <h1 className="mt-1">Hey {firstName(user.name)}</h1>
        </div>
        <ButtonLink href="/find" variant="primary" className="px-[18px] py-[9px]">
          + Get help
        </ButtonLink>
      </div>

      {consent && consent.status !== "approved" && (
        <ConsentBanner status={consent.status} parentEmail={consent.parentEmail} blocked="book" />
      )}
      {!user.schoolId && (
        <p className="muted m-0 text-sm">
          Your school is on the waitlist. You can still meet tutors from other schools online.
        </p>
      )}

      <Card blueprint kicker="Your classes" className="gap-3">
        <div className="flex flex-wrap gap-2">
          {subjects.map((s) => (
            <Tag key={s.subjectId} tone="neutral" className="text-xs">
              {s.subject.name}
            </Tag>
          ))}
        </div>
        <span className="muted text-[13px]">Upcoming sessions, open requests and tutor suggestions land here next.</span>
      </Card>
    </div>
  );
}
