"use client";

import { useState, useTransition } from "react";
import { saveTutorNotesAction } from "@/app/(app)/sessions/actions";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type Props = { sessionId: string; initial: string | null; hint: string };

/** Tutor's private session notes (once the session has started). */
export function TutorNotes({ sessionId, initial, hint }: Props) {
  const flash = useToast();
  const [saved, setSaved] = useState(initial ?? "");
  const [notes, setNotes] = useState(saved);
  const [pending, startTransition] = useTransition();
  const dirty = notes.trim() !== saved.trim();

  const save = () =>
    startTransition(async () => {
      const result = await saveTutorNotesAction(sessionId, notes);
      flash(result.ok ? result.toast : result.error);
      if (result.ok) setSaved(notes);
    });

  return (
    <div className="field flex flex-col">
      <label htmlFor="tutor-notes">Session notes</label>
      <textarea
        id="tutor-notes"
        className="input min-h-24"
        maxLength={2000}
        placeholder="What you covered, what to practice next…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <span className="muted mt-1 text-xs">{hint}</span>
      <Button className="mt-2 self-start text-[13px]" onClick={save} disabled={!dirty || pending}>
        {pending ? "Saving…" : saved ? "Save changes" : "Save notes"}
      </Button>
    </div>
  );
}
