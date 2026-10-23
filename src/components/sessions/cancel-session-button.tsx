"use client";

import { useState, useTransition } from "react";
import { cancelSessionAction } from "@/app/(app)/sessions/actions";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useDialog } from "@/components/ui/use-dialog";

type Props = {
  sessionId: string;
  /** e.g. "Tue Oct 27 · 3:30 pm · Algebra II with Maya R." */
  summary: string;
  /** Who hears about it, e.g. "Maya R." or "Alex P. and their parent". */
  notify: string;
  online: boolean;
};

/** Either participant cancels a booked session before it starts. */
export function CancelSessionButton({ sessionId, summary, notify, online }: Props) {
  const flash = useToast();
  const { open, setOpen, trigger, dialog } = useDialog();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await cancelSessionAction(sessionId, reason.trim() || undefined);
      flash(result.ok ? result.toast : result.error);
      if (result.ok) setOpen(false);
    });

  return (
    <>
      <Button ref={trigger} variant="ghost" aria-haspopup="dialog" className="w-full py-[9px] text-[13px]" onClick={() => setOpen(true)}>
        Cancel session
      </Button>
      {open && (
        <div className="dialog-backdrop" onClick={() => !pending && setOpen(false)}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 id="cancel-title" className="text-xl">
              Cancel this session?
            </h3>
            <p className="m-0 text-sm">{summary}</p>
            <p className="muted m-0 text-[13px]">
              {notify} will get an email.{online && " The Google Meet link will stop working."} The time frees up for new bookings.
            </p>
            <div className="field">
              <label htmlFor="cancel-reason">Reason (optional, shared with them)</label>
              <textarea id="cancel-reason" className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)} disabled={pending}>
                Keep session
              </Button>
              <Button variant="primary" onClick={submit} disabled={pending}>
                {pending ? "Cancelling…" : "Cancel session"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
