"use client";

import clsx from "clsx";
import { useOptimistic, useState, useTransition } from "react";
import { setHoursLoggedAction } from "@/app/(app)/dashboard/actions";
import { Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { CompletedRow } from "@/server/services/hours";

const LOCKED_TOAST = { approved: "Already approved by your teacher", rejected: "Rejected by your teacher. Ask them about it." } as const;

function statusTag(row: CompletedRow) {
  if (row.status === "approved") return <Tag tone="accent">{row.hours}h approved</Tag>;
  if (row.status === "rejected") return <Tag tone="outline">Rejected</Tag>;
  if (row.status === "logged") return <Tag tone="accent">{row.hours}h logged</Tag>;
  return <Tag tone="neutral">{row.hours}h</Tag>;
}

/** "Completed sessions · Check to log hours": checking sends hours for sign-off; unchecking pulls them back. */
export function CompletedSessions({ rows }: { rows: CompletedRow[] }) {
  const flash = useToast();
  const [, startTransition] = useTransition();
  const [showApproved, setShowApproved] = useState(false);
  const [optimistic, setOptimistic] = useOptimistic(rows, (state, { id, logged }: { id: string; logged: boolean }) =>
    state.map((r) => (r.sessionId === id ? { ...r, status: logged ? ("logged" as const) : ("unlogged" as const) } : r)),
  );

  const toggle = (row: CompletedRow) => {
    if (row.status === "approved" || row.status === "rejected") return flash(LOCKED_TOAST[row.status]);
    const logged = row.status === "unlogged";
    startTransition(async () => {
      setOptimistic({ id: row.sessionId, logged });
      const result = await setHoursLoggedAction(row.sessionId, logged);
      flash(result.ok ? result.toast : result.error);
    });
  };

  return (
    <div className="mt-1 flex flex-col border-t border-divider">
      <div className="flex justify-between pt-2.5 pb-1">
        <span className="kicker">Completed sessions</span>
        <span className="muted text-xs">Check to log hours</span>
      </div>
      {optimistic.length === 0 && <span className="muted border-t border-divider py-2 text-[13px]">No completed sessions yet this school year.</span>}
      {/* Sessions that still need something stay visible; signed-off history folds away. */}
      {optimistic.filter((r) => showApproved || r.status !== "approved").map((row) => {
        const checked = row.status !== "unlogged" && row.status !== "rejected";
        const locked = row.status === "approved" || row.status === "rejected";
        return (
          <label
            key={row.sessionId}
            className={clsx("grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-divider py-2 text-[13px]", locked && "cursor-default")}
          >
            <input type="checkbox" className="peer sr-only" checked={checked} onChange={() => toggle(row)} aria-describedby={`hrs-${row.sessionId}`} />
            <span
              aria-hidden
              className={clsx(
                "grid size-4 place-items-center border text-xs leading-none text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                checked ? "border-accent bg-accent" : "border-neutral-600 bg-transparent",
                locked && "opacity-60",
              )}
            >
              {checked ? "✓" : ""}
            </span>
            <span className="flex flex-col">
              <b>
                {row.subjectName} · {row.learnerName}
              </b>
              <span className="muted text-xs">
                {row.dateText}
                {!row.learnerConfirmed && row.status !== "approved" && " · learner hasn't confirmed yet"}
              </span>
            </span>
            <span id={`hrs-${row.sessionId}`}>{statusTag(row)}</span>
          </label>
        );
      })}
      {optimistic.some((r) => r.status === "approved") && (
        <button type="button" className="btn btn-ghost mt-1 self-start text-xs" onClick={() => setShowApproved(!showApproved)} aria-expanded={showApproved}>
          {showApproved ? "Hide approved sessions" : `Show ${optimistic.filter((r) => r.status === "approved").length} approved sessions`}
        </button>
      )}
    </div>
  );
}
