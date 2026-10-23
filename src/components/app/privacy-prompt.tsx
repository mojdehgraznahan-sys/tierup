"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { savePrivacyAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { CONSENT_COPY } from "@/lib/consent";

/**
 * Asks students once (and again when the wording changes) about transcripts and de-identified
 * analytics. Both start unchecked; saving with both unchecked is a valid answer.
 */
export function PrivacyPrompt({ askTranscripts, initial }: { askTranscripts: boolean; initial: { transcripts: boolean; analytics: boolean } }) {
  const flash = useToast();
  const [open, setOpen] = useState(true);
  const [transcripts, setTranscripts] = useState(initial.transcripts);
  const [analytics, setAnalytics] = useState(initial.analytics);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("input")?.focus();
  }, []);

  if (!open) return null;

  const save = () =>
    startTransition(async () => {
      const result = await savePrivacyAction({ transcripts: askTranscripts ? transcripts : undefined, analytics });
      flash(result.ok ? result.toast : result.error);
      if (result.ok) setOpen(false);
    });

  return (
    <div className="dialog-backdrop">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="privacy-title" className="dialog max-h-[90vh] w-[min(560px,100%)] overflow-y-auto">
        <h3 id="privacy-title" className="text-xl">
          Your privacy choices
        </h3>
        <p className="muted m-0 text-sm">Both are optional. You can use TierUp either way, and change your mind anytime in Settings.</p>

        {askTranscripts && (
          <Choice
            checked={transcripts}
            onChange={setTranscripts}
            label={CONSENT_COPY.transcripts.label}
            details={CONSENT_COPY.transcripts.details}
          />
        )}
        <Choice checked={analytics} onChange={setAnalytics} label={CONSENT_COPY.analytics.label} details={CONSENT_COPY.analytics.details} />

        <div className="flex justify-end">
          <Button variant="primary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save my choices"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Choice({ checked, onChange, label, details }: { checked: boolean; onChange: (v: boolean) => void; label: string; details: readonly string[] }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-divider pt-3">
      <label className="radio items-start font-semibold">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="dot mt-0.5 shrink-0" />
        {label}
      </label>
      <ul className="muted m-0 flex list-disc flex-col gap-1 pl-9 text-[13px]">
        {details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </div>
  );
}
