"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeRequestAction } from "@/app/(app)/discovery-actions";
import { Card, Tag } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export type OpenRequest = {
  id: string;
  subjectId: string;
  subjectName: string;
  description: string;
  /** Rendered server-side, since ResponseCard uses server-only pieces. */
  responseCount: number;
};

/** Student Home › Open requests: expandable rows (▸/▾) with tutor replies. */
export function OpenRequests({ requests, responses }: { requests: OpenRequest[]; responses: Record<string, React.ReactNode> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const router = useRouter();
  const flash = useToast();
  const [pending, startTransition] = useTransition();

  const close = (id: string) =>
    startTransition(async () => {
      const result = await closeRequestAction(id);
      flash(result.ok ? result.toast : result.error);
      router.refresh();
    });

  return (
    <Card kicker="Open requests" className="gap-3">
      {requests.length === 0 && <span className="muted text-[13px]">No open requests.</span>}
      {requests.map((r) => {
        const expanded = openId === r.id;
        const label = `${r.subjectName}: ${r.description.length > 28 ? `${r.description.slice(0, 28)}…` : r.description}`;
        return (
          <div key={r.id} className="flex flex-col border-t border-divider">
            <button
              type="button"
              aria-expanded={expanded}
              className="flex cursor-pointer items-center justify-between gap-2 bg-transparent py-2.5 text-left text-sm text-ink hover:text-accent-700"
              onClick={() => setOpenId(expanded ? null : r.id)}
            >
              <span>
                {expanded ? "▾" : "▸"} {label}
              </span>
              <Tag tone={r.responseCount ? "accent" : "neutral"}>
                {r.responseCount ? `${r.responseCount} repl${r.responseCount === 1 ? "y" : "ies"}` : "Waiting"}
              </Tag>
            </button>
            {expanded && (
              <div className="flex flex-col gap-2 pb-3 pl-4">
                {r.responseCount > 0 ? (
                  responses[r.id]
                ) : (
                  <>
                    <span className="muted text-[13px]">
                      No replies yet. Approved {r.subjectName} tutors have been notified. Requests expire after 48 hours.
                    </span>
                    <Link href={`/find?subject=${r.subjectId}`} className="text-[13px]">
                      Browse {r.subjectName} tutors instead →
                    </Link>
                  </>
                )}
                <button type="button" disabled={pending} className="btn btn-ghost self-start text-xs" onClick={() => close(r.id)}>
                  Close this request
                </button>
              </div>
            )}
          </div>
        );
      })}
      <Link href="/find?mode=request" className="text-[13px]">
        Post a new request →
      </Link>
    </Card>
  );
}
