"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { reportAction } from "@/app/(app)/discovery-actions";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const REASONS = [
  "Inappropriate messages",
  "Asked to contact off TierUp",
  "Didn't show up",
  "Made me uncomfortable",
  "Something else",
] as const;

type Props = { againstUserId?: string; sessionId?: string; threadId?: string; label?: string; className?: string };

/** "⚑ Report": a small dialog that files a Report for school staff. */
export function ReportButton({ label = "⚑ Report", className = "text-xs text-neutral-700", ...target }: Props) {
  const flash = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>(REASONS[0]);
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Keyboard: focus moves into the dialog, Escape closes it, focus returns to the trigger.
  useEffect(() => {
    if (!open) return;
    const opener = trigger.current;
    dialog.current?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  const submit = () =>
    startTransition(async () => {
      const result = await reportAction({ ...target, reason, details: details || undefined });
      flash(result.ok ? result.toast : result.error);
      if (result.ok) {
        setOpen(false);
        setDetails("");
      }
    });

  return (
    <>
      <button ref={trigger} type="button" aria-haspopup="dialog" className={`cursor-pointer self-start bg-transparent p-0 underline-offset-2 hover:underline ${className}`} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="dialog-backdrop" onClick={() => setOpen(false)}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="report-title" className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 id="report-title" className="text-xl">
              Report a problem
            </h3>
            <p className="muted m-0 text-sm">School staff will review this. The person you report isn&apos;t told who filed it.</p>
            <div className="flex flex-col gap-2">
              {REASONS.map((r) => (
                <label key={r} className="radio">
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                  <span className="dot" />
                  {r}
                </label>
              ))}
            </div>
            <div className="field">
              <label htmlFor="report-details">What happened? (optional)</label>
              <textarea id="report-details" className="input" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={submit} disabled={pending}>
                {pending ? "Sending…" : "Send report"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
