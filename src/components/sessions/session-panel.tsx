import { ReportButton } from "@/components/discovery/report-button";
import { CopyButton } from "@/components/ui/copy-button";
import { ButtonLink, Card, Tag } from "@/components/ui/primitives";
import type { threadView } from "@/server/services/messaging";
import { joinWindow, sessionFormatLabel } from "@/lib/format";

type View = NonNullable<Awaited<ReturnType<typeof threadView>>>;

/** Right column: what's booked (or how to book), the Meet box, and Report. */
export function SessionPanel({ view }: { view: View }) {
  const s = view.session;
  const other = view.role === "tutor" ? view.learner : view.tutor;

  return (
    <aside className="flex flex-col gap-3 p-4" aria-label="Session details">
      <span className="kicker">Session</span>
      <h3 className="text-2xl">{view.subject.name}</h3>

      {!s ? (
        <>
          <span className="text-sm">Not booked yet</span>
          <Tag tone="neutral" className="self-start">
            Messaging
          </Tag>
          {view.role === "learner" ? (
            <>
              <p className="muted m-0 text-[13px]">Chat first and agree on a topic and time, then book when you&apos;re ready.</p>
              <ButtonLink href={`/tutors/${view.tutor.id}/book?subject=${view.subject.id}&thread=${view.id}`} variant="primary" className="w-full py-[9px]">
                Book with {view.tutor.name}
              </ButtonLink>
            </>
          ) : (
            <p className="muted m-0 text-[13px]">
              When {view.learner.name} books, this chat becomes the session and the history is kept.
            </p>
          )}
        </>
      ) : (
        <>
          <span className="text-sm">
            {s.when} · {s.durationMin} min
          </span>
          <div className="flex flex-wrap gap-1.5">
            <Tag tone="neutral">{sessionFormatLabel(s.format)}</Tag>
            {s.status !== "confirmed" && <Tag tone="outline">{s.statusLabel}</Tag>}
          </div>
          {s.format === "online" && s.meetUrl && s.status === "confirmed" && <MeetBox url={s.meetUrl} startsAt={s.startsAt} durationMin={s.durationMin} />}
          {s.format === "in_person" && <span className="text-sm">📍 {s.location ?? "School"}</span>}
        </>
      )}

      {view.role !== "staff" && (
        <div className="mt-2 border-t border-divider pt-3">
          <ReportButton label="⚑ Report a problem" againstUserId={other.id} threadId={view.id} sessionId={s?.id} />
        </div>
      )}
    </aside>
  );
}

function MeetBox({ url, startsAt, durationMin }: { url: string; startsAt: Date; durationMin: number }) {
  const join = joinWindow(startsAt, durationMin);
  return (
    <Card className="gap-2 p-3.5">
      <b className="text-sm">One-time Google Meet</b>
      <code className="font-mono text-sm break-all">{url.replace(/^https?:\/\//, "")}</code>
      <span className="muted text-xs">Single-use · expires at session end · join and leave times are logged</span>
      {join.open ? (
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary w-full py-[9px]">
          Join Google Meet
        </a>
      ) : (
        <span className="btn btn-primary w-full py-[9px]" aria-disabled="true">
          {join.ended ? "Session ended" : "Opens 10 min before start"}
        </span>
      )}
      {!join.ended && <CopyButton text={url} />}
    </Card>
  );
}
