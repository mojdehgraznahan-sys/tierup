"use client";

import { useState, useTransition } from "react";
import { passRequestAction, replyToRequestAction } from "@/app/(app)/dashboard/actions";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export type InboxItem = {
  id: string;
  subjectName: string;
  description: string;
  learnerLabel: string;
  formatText: string;
  postedText: string;
  expiresText: string;
};

/**
 * Open requests in the tutor's subjects. Accept opens a short reply the learner can book from;
 * Pass hides the request.
 */
export function RequestInbox({ items }: { items: InboxItem[] }) {
  const flash = useToast();
  const [replying, setReplying] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const open = (id: string, subject: string) => {
    setReplying(id);
    setError(null);
    setMessage(`I can help with ${subject}! `);
  };

  const send = (id: string) =>
    startTransition(async () => {
      setError(null);
      const result = await replyToRequestAction(id, message);
      if (!result.ok) return setError(result.error);
      setReplying(null);
      flash(result.toast);
    });

  const pass = (id: string) =>
    startTransition(async () => {
      const result = await passRequestAction(id);
      flash(result.ok ? result.toast : result.error);
    });

  if (items.length === 0) return <p className="muted m-0 py-3.5">You&apos;re all caught up.</p>;

  return (
    <div className="flex flex-col border-t border-divider">
      {items.map((r) => (
        <div key={r.id} className="flex flex-col gap-3 border-b border-divider py-3.5">
          <div className="grid items-center gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
            <div className="flex flex-col gap-0.5">
              <b>
                {r.subjectName} · &ldquo;{r.description}&rdquo;
              </b>
              <span className="muted text-xs">
                {r.learnerLabel} · Open request · {r.postedText}
              </span>
            </div>
            <span className="text-[13px]">
              {r.formatText} · {r.expiresText}
            </span>
            <div className="flex gap-2">
              <Button variant="primary" disabled={pending} onClick={() => open(r.id, r.subjectName)}>
                Accept
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => pass(r.id)}>
                Pass
              </Button>
            </div>
          </div>
          {replying === r.id && (
            <form
              className="flex flex-col gap-2 md:pl-4"
              onSubmit={(e) => {
                e.preventDefault();
                send(r.id);
              }}
            >
              <label htmlFor={`reply-${r.id}`} className="field-label">
                Your reply (suggest a time and place)
              </label>
              <textarea id={`reply-${r.id}`} className="input min-h-[70px]" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
              {error && (
                <p role="alert" className="m-0 text-xs text-accent-2-800">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={pending || message.trim().length < 2}>
                  Send reply
                </Button>
                <Button type="button" variant="ghost" onClick={() => setReplying(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
