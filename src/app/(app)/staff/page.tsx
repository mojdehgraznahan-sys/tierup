import type { Metadata } from "next";
import Link from "next/link";
import {
  approveAllConfirmedAction,
  approveHoursAction,
  approveSubjectAction,
  dismissReportAction,
  notifyParentsAction,
  pauseTutorAction,
  rejectHoursAction,
  revokeSubjectAction,
  unpauseTutorAction,
  warnReportAction,
} from "./actions";
import { ActionButton } from "@/components/staff/action-button";
import { Card, Tag } from "@/components/ui/primitives";
import { requireOnboarded } from "@/server/policies/session";
import { approvalsQueue, hoursQueue, reportsQueue, sessionLog } from "@/server/services/moderation";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Moderation" };

type Tab = "approvals" | "hours" | "reports" | "log";
const TABS: [Tab, string][] = [
  ["approvals", "Tutor approvals"],
  ["hours", "Service hours"],
  ["reports", "Reports"],
  ["log", "Session log"],
];

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function StaffPage({ searchParams }: Props) {
  const staff = await requireOnboarded(["staff"]);
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.some(([t]) => t === raw) ? (raw as Tab) : "approvals";

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-5">
        <div>
          <span className="kicker">Staff · {staff.school?.name}</span>
          <h1 className="mt-1">Moderation</h1>
        </div>
        <nav className="seg flex-wrap" aria-label="Moderation sections">
          {TABS.map(([t, label]) => (
            <Link key={t} href={`/staff?tab=${t}`} className="seg-opt" aria-current={t === tab ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {tab === "approvals" && <Approvals staff={staff} />}
      {tab === "hours" && <Hours staff={staff} />}
      {tab === "reports" && <Reports staff={staff} />}
      {tab === "log" && <SessionLog staff={staff} />}
    </div>
  );
}

type StaffUser = Awaited<ReturnType<typeof requireOnboarded>>;

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

async function Approvals({ staff }: { staff: StaffUser }) {
  const rows = await approvalsQueue(staff);
  return (
    <>
      {rows.length === 0 ? (
        <p className="muted">No tutor requests yet. When students name you as their teacher, they show up here.</p>
      ) : (
        <TableWrap>
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th>Student</th>
                <th>Subject</th>
                <th>Grade</th>
                <th>Endorser</th>
                <th>Parent consent</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.student}</td>
                  <td>{a.subject}</td>
                  <td>{a.courseGrade}</td>
                  <td className="muted text-[13px]">{a.endorser ?? "—"}</td>
                  <td>
                    <Tag tone={a.consentGiven ? "accent" : "neutral"}>{a.consentGiven ? "✓ Given" : "Pending"}</Tag>
                  </td>
                  <td className="text-right">
                    {a.status === "approved" ? (
                      <ActionButton action={revokeSubjectAction.bind(null, a.id)} confirm={`Revoke ${a.student.split(" ·")[0]}'s approval for ${a.subject}?`}>
                        Revoke
                      </ActionButton>
                    ) : (
                      <ActionButton
                        action={approveSubjectAction.bind(null, a.id)}
                        variant="primary"
                        disabled={!a.consentGiven}
                        title={a.consentGiven ? undefined : "Waiting for a parent to consent"}
                      >
                        {a.status === "revoked" ? "Re-approve" : "Approve"}
                      </ActionButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <p className="muted text-xs">
        You approve each subject separately and can revoke approval at any time. You can&apos;t approve until a parent has consented.
      </p>
    </>
  );
}

async function Hours({ staff }: { staff: StaffUser }) {
  const q = await hoursQueue(staff);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <span className="muted text-sm">
          {q.waitingCount} waiting · {q.waitingHours}h total
        </span>
        <ActionButton action={approveAllConfirmedAction} disabled={q.confirmedCount === 0}>
          Approve all confirmed ({q.confirmedCount})
        </ActionButton>
      </div>
      {q.rows.length === 0 ? (
        <p className="muted">No hours waiting for sign-off.</p>
      ) : (
        <TableWrap>
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Tutor</th>
                <th>Learner</th>
                <th>Subject</th>
                <th>Session</th>
                <th>Hours</th>
                <th>Learner confirmed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.rows.map((h) => (
                <tr key={h.id}>
                  <td>{h.tutor}</td>
                  <td>{h.learner}</td>
                  <td>{h.subject}</td>
                  <td>{h.session}</td>
                  <td>{h.hours}h</td>
                  <td>
                    <Tag tone={h.learnerConfirmed ? "accent" : "neutral"}>{h.learnerConfirmed ? "✓ Yes" : "Not yet"}</Tag>
                  </td>
                  <td className="text-right">
                    {h.status === "logged" ? (
                      <div className="flex justify-end gap-1.5">
                        <ActionButton action={rejectHoursAction.bind(null, h.id)} variant="ghost" confirm={`Reject ${h.hours}h for ${h.tutor}?`}>
                          Reject
                        </ActionButton>
                        <ActionButton action={approveHoursAction.bind(null, h.id)} variant="primary">
                          Approve
                        </ActionButton>
                      </div>
                    ) : (
                      <Tag tone={h.status === "approved" ? "accent" : "outline"}>{h.status === "approved" ? "✓ Approved" : "Rejected"}</Tag>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <p className="muted text-xs">
        Tutors log hours from their dashboard. Approved hours count toward their service-hour total. &ldquo;Approve all&rdquo; only covers
        sessions the learner has confirmed.
      </p>
    </>
  );
}

const REPORT_STATUS = { new: "New", dismissed: "Dismissed", warned: "Warned", paused: "Tutor paused" } as const;

async function Reports({ staff }: { staff: StaffUser }) {
  const reports = await reportsQueue(staff);
  if (reports.length === 0) return <p className="muted">No reports. Nice.</p>;
  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      {reports.map((r) => (
        <Card key={r.id} className="gap-2.5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="card-title">
              Report #{r.number} · {r.title}
            </span>
            <Tag tone="outline">{REPORT_STATUS[r.status]}</Tag>
          </div>
          <span className="card-meta">
            Filed by {r.filedBy}
            {r.against ? ` against ${r.against}` : ""} · {timeAgo(r.createdAt)}
            {r.sessionLabel ? ` · ${r.sessionLabel}` : ""}
          </span>
          {r.reason !== r.title && <span className="text-sm">{r.reason}</span>}
          {r.excerpt.length > 0 && (
            <div className="flex flex-col gap-1.5 border border-divider p-3 text-sm">
              {r.excerpt.map((m) => (
                <span key={m.id} className={m.flagged ? "bg-accent-200 px-1 py-0.5" : undefined}>
                  {m.sender}: {m.body}
                </span>
              ))}
            </div>
          )}
          {r.actions.length > 0 && <span className="muted text-xs">Actions so far: {r.actions.map((a) => a.replace("_", " ")).join(", ")}</span>}
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton action={dismissReportAction.bind(null, r.id)} disabled={r.status === "dismissed"}>
              Dismiss
            </ActionButton>
            <ActionButton action={warnReportAction.bind(null, r.id)} disabled={!r.against} confirm={`Email ${r.against} a warning?`}>
              Warn
            </ActionButton>
            {r.againstIsTutor &&
              (r.againstPaused ? (
                <ActionButton action={unpauseTutorAction.bind(null, r.id)}>Lift pause</ActionButton>
              ) : (
                <ActionButton
                  action={pauseTutorAction.bind(null, r.id)}
                  variant="primary"
                  confirm={`Pause ${r.against}? They'll be hidden from learners and their upcoming sessions will be cancelled.`}
                >
                  Pause tutor
                </ActionButton>
              ))}
            <ActionButton action={notifyParentsAction.bind(null, r.id)} variant="ghost" confirm="Email both families about this report?">
              Notify parents
            </ActionButton>
            {r.threadId && (
              <Link href={`/sessions/${r.threadId}`} className="ml-auto text-[13px]">
                Open full chat →
              </Link>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

async function SessionLog({ staff }: { staff: StaffUser }) {
  const rows = await sessionLog(staff);
  return (
    <>
      {rows.length === 0 ? (
        <p className="muted">No sessions yet.</p>
      ) : (
        <TableWrap>
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>When</th>
                <th>Tutor → Learner</th>
                <th>Subject</th>
                <th>Format</th>
                <th>Meet link</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/sessions/${s.threadId}`} className="text-ink">
                      {s.when}
                    </Link>
                  </td>
                  <td>
                    {s.tutor} → {s.learner}
                  </td>
                  <td>{s.subject}</td>
                  <td>
                    {s.format}
                    {s.location ? ` · ${s.location}` : ""}
                  </td>
                  <td className="font-mono text-xs">
                    {s.meetUrl ? `${s.meetUrl.replace(/^https?:\/\//, "")} · single-use` : "—"}
                    {s.attendance.map((a) => (
                      <span key={a.who + a.text} className="block font-sans text-neutral-600">
                        {a.who}: {a.text}
                      </span>
                    ))}
                  </td>
                  <td>
                    <Tag tone="neutral">{s.status}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <p className="muted text-xs">
        Every Meet link is created for a single session and expires when it ends. Join and leave times are attached to the log when
        Google provides them.
      </p>
    </>
  );
}
