import type { Metadata } from "next";
import Link from "next/link";
import { ConsentBanner } from "@/components/app/consent-banner";
import { parentConsentEnabled } from "@/server/policies/rules";
import { CompletedSessions } from "@/components/dashboard/completed-sessions";
import { RequestInbox } from "@/components/dashboard/request-inbox";
import { ActionButton } from "@/components/staff/action-button";
import { resendApprovalAction } from "./actions";
import { ButtonLink, Card, Tag } from "@/components/ui/primitives";
import { db } from "@/server/db";
import { requireOnboarded } from "@/server/policies/session";
import { tutorHours } from "@/server/services/hours";
import { tutorInbox } from "@/server/services/requests";
import { awaitingTutorWrapUp, tutorWeekCount, upcomingForTutor } from "@/server/services/sessions";
import { joinWindow, sessionFormatLabel, timeAgo } from "@/lib/format";
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

const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

function expiresIn(date: Date) {
  const hours = Math.max(0, Math.round((date.getTime() - Date.now()) / 3600000));
  return hours < 1 ? "expires soon" : `expires in ${hours}h`;
}

export default async function TutorDashboardPage() {
  const user = await requireOnboarded(["tutor"]);
  const [hours, upcoming, inbox, weekCount, subjects, toWrapUp] = await Promise.all([
    tutorHours(user.id),
    upcomingForTutor(user.id),
    tutorInbox(user.id),
    tutorWeekCount(user.id),
    db.tutorSubject.findMany({
      where: { tutorId: user.id },
      include: { subject: true, endorser: { select: { name: true, email: true } } },
      orderBy: { subject: { name: "asc" } },
    }),
    awaitingTutorWrapUp(user.id),
  ]);
  const consent = user.consent;
  const cap = user.tutorStatus?.weeklyCap ?? 3;
  const pct = Math.min(100, (hours.approved / hours.goal) * 100);

  return (
    <div className="flex flex-col">
      <div className="pt-8 pb-5">
        <span className="kicker">Tutor dashboard</span>
        <h1 className="mt-1">Hey {firstName(user.name)}</h1>
      </div>

      {parentConsentEnabled() && consent && consent.status !== "approved" && (
        <div className="mb-6">
          <ConsentBanner status={consent.status} parentEmail={consent.parentEmail} blocked="tutor" />
        </div>
      )}
      {user.tutorStatus?.paused && (
        <p role="status" className="mt-0 mb-6 border border-accent-2-300 bg-accent-2-100 px-4 py-3 text-sm text-accent-2-800">
          Your tutoring is paused by school staff. You&apos;re hidden from learners until they lift it.
        </p>
      )}

      {toWrapUp.length > 0 && (
        <Card kicker="How did it go?" className="mb-6 gap-2">
          {toWrapUp.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-2 first-of-type:border-t-0 first-of-type:pt-0">
              <span className="text-sm">
                <b>{s.subjectName}</b> with {s.learnerName} · {s.when}
              </span>
              <ButtonLink href={`/sessions/${s.threadId}?wrapup=1`} className="text-[13px]">
                Wrap up session
              </ButtonLink>
            </div>
          ))}
          <span className="muted text-xs">Tell us if your learner showed up. Feedback goes privately to school staff.</span>
        </Card>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-6">
        <Card blueprint kicker={`Service hours · ${hours.yearLabel}`} className="gap-2.5 p-5">
          <div className="flex items-baseline gap-2">
            <span className="h text-[56px] leading-none">{fmtHours(hours.approved)}</span>
            <span className="muted">/ {hours.goal} goal</span>
          </div>
          <div
            className="h-2.5 bg-neutral-200"
            role="progressbar"
            aria-label="Approved service hours"
            aria-valuemin={0}
            aria-valuemax={hours.goal}
            aria-valuenow={hours.approved}
          >
            <div className="h-2.5 bg-accent-2" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-[13px]">
            <span className="muted">{fmtHours(hours.pending)}h waiting for teacher sign-off</span>
            <span className="flex gap-3">
              Export log:
              <a href="/api/hours/export?format=pdf" download>
                PDF
              </a>
              <a href="/api/hours/export?format=csv" download>
                CSV
              </a>
            </span>
          </div>
          <CompletedSessions rows={hours.rows} />
        </Card>

        <Card kicker="Your upcoming sessions" className="gap-2.5 p-5">
          {upcoming.length === 0 && <span className="muted border-t border-divider pt-2.5 text-[13px]">Nothing booked yet.</span>}
          {upcoming.map((s) => {
            const join = joinWindow(s.startsAt, s.durationMin);
            const started = s.startsAt.getTime() <= Date.now();
            return (
              <div key={s.id} className="flex flex-col gap-1 border-t border-divider py-2.5">
                <div className="flex justify-between gap-2">
                  <Link href={`/sessions/${s.threadId}`} className="font-semibold text-ink no-underline hover:text-accent-700">
                    {s.when} · {s.subjectName}
                  </Link>
                  <Tag tone="neutral">{sessionFormatLabel(s.format)}</Tag>
                </div>
                <div className="muted flex items-center justify-between gap-2 text-[13px]">
                  <span>
                    with {s.learnerName} · {s.where}
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
                {started && (
                  <Link href={`/sessions/${s.threadId}`} className="self-start text-[13px]">
                    Log session notes →
                  </Link>
                )}
              </div>
            );
          })}
          <span className="muted text-xs">
            {weekCount} of {cap} sessions booked this week.
          </span>
        </Card>
      </div>

      <div className="mt-9 mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3>Open requests in your subjects</h3>
        <span className="muted text-[13px]">
          {inbox.requests.length} open · max {cap} sessions/week
        </span>
      </div>
      {inbox.eligible ? (
        <RequestInbox
          items={inbox.requests.map((r) => ({
            id: r.id,
            subjectName: r.subjectName,
            description: r.description,
            learnerLabel: r.learnerLabel,
            formatText: r.formatText,
            postedText: timeAgo(r.createdAt),
            expiresText: expiresIn(r.expiresAt),
          }))}
        />
      ) : (
        <p className="muted m-0 border-t border-divider py-3.5 text-sm">
          Requests show up here once {parentConsentEnabled() && "your parent has consented and "}a teacher approves at least one of
          your subjects.
        </p>
      )}

      <Card kicker="Your subjects" className="mt-9 gap-0">
        {subjects.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-divider py-2.5 first-of-type:border-t-0">
            <div className="flex flex-col">
              <b className="h text-lg">{s.subject.name}</b>
              <span className="card-meta">{endorserLine(s.status, s.endorser?.name ?? s.endorserEmail)}</span>
            </div>
            <span className="flex flex-wrap items-center justify-end gap-2">
              {s.status === "pending" && (s.endorser?.email ?? s.endorserEmail) && (
                <>
                  {s.requestSentAt && <span className="card-meta">sent {timeAgo(s.requestSentAt)}</span>}
                  <ActionButton action={resendApprovalAction.bind(null, s.id)} variant="ghost" className="text-xs">
                    Resend
                  </ActionButton>
                </>
              )}
              <Tag tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Tag>
            </span>
          </div>
        ))}
        <p className="muted m-0 pt-3 text-[13px]">
          You show up to learners for a subject once {parentConsentEnabled() && "your parent has consented and "}a teacher approves
          it.
        </p>
      </Card>
    </div>
  );
}
