import { ReportButton } from "@/components/discovery/report-button";
import { CancelSessionButton } from "@/components/sessions/cancel-session-button";
import { ReviewButton } from "@/components/sessions/review-button";
import { TutorNotes } from "@/components/sessions/tutor-notes";
import { TutorWrapUpButton } from "@/components/sessions/tutor-wrap-up-button";
import { MicRecorder } from "@/components/sessions/mic-recorder";
import { ActionButton } from "@/components/staff/action-button";
import { stopTranscribingAction } from "@/app/(app)/sessions/actions";
import { parentConsentEnabled } from "@/server/policies/rules";
import { CopyButton } from "@/components/ui/copy-button";
import { ButtonLink, Card, Tag } from "@/components/ui/primitives";
import type { threadView } from "@/server/services/messaging";
import { joinWindow, sessionFormatLabel } from "@/lib/format";

type View = NonNullable<Awaited<ReturnType<typeof threadView>>>;

/**
 * Right column: what's booked (or how to book), the Meet box, wrap-up, and Report.
 * `openWrapUp` opens the viewer's wrap-up dialog straight away (the "How did it go?" links).
 */
export function SessionPanel({ view, openWrapUp = false }: { view: View; openWrapUp?: boolean }) {
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
          {s.status === "confirmed" && s.started && !s.review && (
            view.role === "learner" ? (
              <ReviewButton sessionId={s.id} subjectName={view.subject.name} tutorName={view.tutor.name} defaultOpen={openWrapUp} />
            ) : (
              <p className="muted m-0 text-[13px]">Waiting for {view.learner.name} to mark it complete and review.</p>
            )
          )}
          {view.role === "tutor" && s.started && !s.tutorWrappedUp && (s.status === "confirmed" || s.status === "completed") && (
            <TutorWrapUpButton
              sessionId={s.id}
              subjectName={view.subject.name}
              learnerName={view.learner.name}
              learnerConfirmed={s.status === "completed"}
              defaultOpen={openWrapUp}
            />
          )}
          {s.status === "confirmed" && !s.started && view.role !== "staff" && (
            <CancelSessionButton
              sessionId={s.id}
              summary={`${s.when} · ${view.subject.name} with ${other.name}`}
              notify={cancelNotify(view)}
              online={s.format === "online"}
            />
          )}
          {view.role !== "staff" && <TranscriptBox view={view} session={s} />}
          {s.summary && <SummaryCard summary={s.summary} staff={view.role === "staff"} />}
          <Outcome view={view} session={s} />
          {view.role === "tutor" && s.started && s.status !== "cancelled" && (
            <TutorNotes sessionId={s.id} initial={s.tutorNotes} hint={notesHint(view.learner.name)} />
          )}
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

/** Who cancelSession emails: the other participant, plus the learner's parent when consent is on. */
function cancelNotify(view: View) {
  const parents = parentConsentEnabled();
  if (view.role === "learner") return `${view.tutor.name}${parents ? " and your parent" : ""}`;
  return `${view.learner.name}${parents ? " and their parent" : ""}`;
}

function notesHint(learnerName: string) {
  return parentConsentEnabled()
    ? `School staff can read these. If ${learnerName}'s parent gets session summaries, notes saved before ${learnerName} confirms the session are included.`
    : "Private to you and school staff.";
}

/**
 * Transcription for the AI summary: what's happening and, for mic capture, the recorder. Students
 * never see the transcript itself, only the summary made from it.
 */
function TranscriptBox({ view, session: s }: { view: View; session: NonNullable<View["session"]> }) {
  if (!s.transcriptSource || s.status === "cancelled" || s.status === "no_show") return null;
  const now = Date.now();
  if (!s.transcribe) return s.started ? null : <p className="muted m-0 text-[13px]">Transcription is off for this session.</p>;

  const isTutor = view.role === "tutor";
  const inPerson = s.format === "in_person";
  const micOpen = now >= s.micWindow.opens.getTime() && now <= s.micWindow.closes.getTime();
  const body = (() => {
    if (s.transcriptReady) return <span className="muted text-[13px]">Transcript received. Only the AI summary uses it.</span>;
    if (s.transcriptSource === "google_meet") {
      return (
        <span className="muted text-[13px]">
          Google Meet transcribes this session.
          {isTutor && " If it doesn't start on its own, open Activities → Transcripts → Start transcript in Meet."}
        </span>
      );
    }
    if (micOpen && (!inPerson || isTutor)) {
      return (
        <MicRecorder
          sessionId={s.id}
          closesAt={s.micWindow.closes.toISOString()}
          hint={inPerson ? "Put your device between you both, then start." : "Keep this page open next to Meet. Headphones help."}
        />
      );
    }
    if (micOpen) return <span className="muted text-[13px]">{view.tutor.name}&apos;s device transcribes this in-person session.</span>;
    if (!s.started) {
      return (
        <span className="muted text-[13px]">
          {inPerson && !isTutor ? `${view.tutor.name}'s device` : "This page"} will transcribe it, starting 10 minutes before.
        </span>
      );
    }
    return null;
  })();

  return (
    <Card className="gap-2 p-3">
      <span className="card-meta">Transcribed for an AI summary</span>
      {body}
      {!s.started && (
        <ActionButton action={stopTranscribingAction.bind(null, s.id)} variant="ghost" className="self-start text-xs" confirm="Turn off transcription for this session?">
          Don&apos;t transcribe this session
        </ActionButton>
      )}
    </Card>
  );
}

/** The AI summary (learner, tutor and staff all see it). */
function SummaryCard({ summary, staff }: { summary: { topics: string[]; nextSteps: string[] }; staff: boolean }) {
  return (
    <Card className="gap-2 p-3">
      <span className="card-meta">Session summary · AI</span>
      <div className="flex flex-col gap-1">
        <b className="text-[13px]">Topics covered</b>
        <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-[13px]">
          {summary.topics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      {summary.nextSteps.length > 0 && (
        <div className="flex flex-col gap-1">
          <b className="text-[13px]">Practice next</b>
          <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4 text-[13px]">
            {summary.nextSteps.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      <span className="muted text-xs">
        {staff
          ? "Written by AI from the tutor's notes and the chat. The learner and tutor got it by email."
          : "Written by AI from the tutor's notes and your chat, so it can get things wrong. School staff can see it too."}
      </span>
    </Card>
  );
}

const HAPPENED_LABEL ={ yes: "It happened", cut_short: "Cut short", no_show: "Tutor didn't show" } as const;

/** Read-only wrap-up: cancellation, the learner's review, the tutor's wrap-up and notes. */
function Outcome({ view, session: s }: { view: View; session: NonNullable<View["session"]> }) {
  const role = view.role;
  return (
    <>
      {s.status === "cancelled" && (
        <p className="muted m-0 text-[13px]">
          Cancelled by {s.cancelledByMe ? "you" : (s.cancelledBy ?? "a participant")}
          {s.cancelReason ? `: "${s.cancelReason}"` : "."}
        </p>
      )}
      {s.review && (
        <Card className="gap-1 p-3">
          <span className="card-meta">{role === "learner" ? "Your review" : "Learner's review"}</span>
          <span className="text-sm">
            {s.review.stars ? `${"★".repeat(s.review.stars)}${"☆".repeat(5 - s.review.stars)} · ` : ""}
            {HAPPENED_LABEL[s.review.happened]}
          </span>
          {s.review.tags.length > 0 && <span className="muted text-xs">{s.review.tags.join(" · ")}</span>}
          {s.review.comment && <span className="text-[13px]">&ldquo;{s.review.comment}&rdquo;</span>}
        </Card>
      )}
      {role !== "learner" && s.tutorWrappedUp && (
        <Card className="gap-1 p-3">
          <span className="card-meta">{role === "tutor" ? "Your wrap-up" : "Tutor's wrap-up"}</span>
          <span className="text-sm">
            {view.learner.name} {s.learnerShowedUp ? "showed up" : "didn't show up"}
          </span>
          {s.tutorFeedback && <span className="text-[13px] whitespace-pre-wrap">&ldquo;{s.tutorFeedback}&rdquo;</span>}
          {role === "tutor" && s.tutorFeedback && <span className="muted text-xs">Only school staff see this.</span>}
        </Card>
      )}
      {role === "learner" && s.learnerShowedUp === false && (
        <p className="m-0 text-[13px]">
          {view.tutor.name} said you didn&apos;t show up. If that&apos;s not right, report a problem below.
        </p>
      )}
      {role === "staff" && s.tutorNotes && (
        <Card className="gap-1 p-3">
          <span className="card-meta">Tutor&apos;s notes</span>
          <span className="text-[13px] whitespace-pre-wrap">{s.tutorNotes}</span>
        </Card>
      )}
    </>
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
