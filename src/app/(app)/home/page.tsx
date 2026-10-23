import type { Metadata } from "next";
import Link from "next/link";
import { ConsentBanner } from "@/components/app/consent-banner";
import { crossSchoolEnabled, parentConsentEnabled } from "@/server/policies/rules";
import { OpenRequests } from "@/components/discovery/open-requests";
import { ResponseCard } from "@/components/discovery/response-card";
import { TutorMiniCard } from "@/components/discovery/tutor-card";
import { ButtonLink, Card, Tag } from "@/components/ui/primitives";
import { requireOnboarded } from "@/server/policies/session";
import { tutorsForMyClasses } from "@/server/services/discovery";
import { myOpenRequests } from "@/server/services/requests";
import { awaitingReview, upcomingForLearner } from "@/server/services/sessions";
import { joinWindow, sessionFormatLabel } from "@/lib/format";
import { longDate } from "@/lib/time";
import { firstName } from "@/lib/names";

export const metadata: Metadata = { title: "Home" };

export default async function StudentHomePage() {
  const user = await requireOnboarded(["learner"]);
  const viewer = { id: user.id, schoolId: user.schoolId };
  const [toReview, upcoming, requests, tutors] = await Promise.all([
    awaitingReview(user.id),
    upcomingForLearner(user.id),
    myOpenRequests(user.id),
    tutorsForMyClasses(viewer),
  ]);
  const consent = user.consent;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-5">
        <div>
          <span className="kicker">{longDate(new Date())}</span>
          <h1 className="mt-1">Hey {firstName(user.name)}</h1>
        </div>
        <ButtonLink href="/find" variant="primary" className="px-[18px] py-[9px]">
          + Get help
        </ButtonLink>
      </div>

      {parentConsentEnabled() && consent && consent.status !== "approved" && (
        <div className="mb-6">
          <ConsentBanner status={consent.status} parentEmail={consent.parentEmail} blocked="book" />
        </div>
      )}
      {!user.schoolId && (
        <p className="muted mt-0 mb-6 text-sm">
          Your school is on the waitlist.{" "}
          {crossSchoolEnabled() ? "You can still meet tutors from other schools online." : "You'll be able to find tutors once it joins TierUp."}
        </p>
      )}

      {toReview.length > 0 && (
        <Card kicker="How did it go?" className="mb-6 gap-2">
          {toReview.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-2 first-of-type:border-t-0 first-of-type:pt-0">
              <span className="text-sm">
                <b>{s.subjectName}</b> with {s.tutorName} · {s.when}
              </span>
              <ButtonLink href={`/sessions/${s.threadId}?wrapup=1`} className="text-[13px]">
                Review session
              </ButtonLink>
            </div>
          ))}
          <span className="muted text-xs">Marking a session complete confirms your tutor&apos;s service hours.</span>
        </Card>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-6">
        <Card blueprint kicker="Upcoming sessions" className="gap-3">
          {upcoming.length === 0 && <span className="muted text-[13px]">Nothing booked yet.</span>}
          {upcoming.map((s) => {
            const join = joinWindow(s.startsAt, s.durationMin);
            return (
              <div key={s.id} className="flex flex-col gap-1.5 border-t border-divider py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/sessions/${s.threadId}`} className="h text-lg text-ink no-underline hover:text-accent-700">
                    {s.subjectName} · {s.when}
                  </Link>
                  <Tag tone="neutral">{sessionFormatLabel(s.format)}</Tag>
                </div>
                <div className="muted flex items-center justify-between gap-2 text-[13px]">
                  <span>
                    with {s.tutorName} · {s.where}
                  </span>
                  {s.meetUrl &&
                    (join.open ? (
                      <a href={s.meetUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                        Join Meet
                      </a>
                    ) : (
                      <span className="btn btn-primary" aria-disabled="true" title="The Meet link opens 10 minutes before the session">
                        Join Meet
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </Card>

        <OpenRequests
          requests={requests.map((r) => ({
            id: r.id,
            subjectId: r.subjectId,
            subjectName: r.subjectName,
            description: r.description,
            responseCount: r.responses.length,
          }))}
          responses={Object.fromEntries(
            requests.map((r) => [
              r.id,
              <div key={r.id} className="flex flex-col gap-2">
                {r.responses.map((x) => (
                  <ResponseCard key={x.id} response={x} subjectId={r.subjectId} requestId={r.id} />
                ))}
              </div>,
            ]),
          )}
        />
      </div>

      <h3 className="mt-9 mb-3">Tutors for your classes</h3>
      {tutors.length === 0 ? (
        <p className="muted m-0 text-sm">
          No approved tutors for your classes yet. <Link href="/find?mode=request">Post a request</Link> and we&apos;ll
          notify them.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {tutors.map((t) => (
            <TutorMiniCard key={t.id} tutor={t} />
          ))}
        </div>
      )}
    </div>
  );
}
