"use client";

import { useState, useTransition } from "react";
import { tutorWrapUpAction } from "@/app/(app)/sessions/actions";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useDialog } from "@/components/ui/use-dialog";

type Props = {
  sessionId: string;
  subjectName: string;
  learnerName: string;
  /** The learner already said the session happened. */
  learnerConfirmed: boolean;
  defaultOpen?: boolean;
};

/** Tutor's wrap-up: did the learner show up, plus private feedback for school staff. */
export function TutorWrapUpButton({ sessionId, subjectName, learnerName, learnerConfirmed, defaultOpen = false }: Props) {
  const flash = useToast();
  const { open, setOpen, trigger, dialog } = useDialog(defaultOpen);
  const [showedUp, setShowedUp] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await tutorWrapUpAction(sessionId, { learnerShowedUp: showedUp, feedback: feedback.trim() || undefined });
      flash(result.ok ? result.toast : result.error);
      if (result.ok) setOpen(false);
    });

  return (
    <>
      <Button ref={trigger} variant="primary" aria-haspopup="dialog" className="w-full py-[9px]" onClick={() => setOpen(true)}>
        Wrap up session
      </Button>
      {open && (
        <div className="dialog-backdrop" onClick={() => !pending && setOpen(false)}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="wrap-up-title" className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3 id="wrap-up-title" className="text-xl">
              How did {subjectName} with {learnerName} go?
            </h3>

            <div className="field">
              <span className="field-label" id="wrap-up-showed">
                Did {learnerName} show up?
              </span>
              <div className="seg" role="radiogroup" aria-labelledby="wrap-up-showed">
                <label className="seg-opt px-3 text-[13px]">
                  <input type="radio" name="wrap-up-showed" checked={showedUp} onChange={() => setShowedUp(true)} />
                  Yes
                </label>
                <label className="seg-opt px-3 text-[13px]">
                  <input type="radio" name="wrap-up-showed" checked={!showedUp} onChange={() => setShowedUp(false)} />
                  No, they didn&apos;t show
                </label>
              </div>
            </div>

            <div className="field">
              <label htmlFor="wrap-up-feedback">{showedUp ? "Feedback for school staff (optional)" : "What happened? (optional)"}</label>
              <textarea
                id="wrap-up-feedback"
                className="input"
                maxLength={1000}
                placeholder={showedUp ? "Came prepared, needs more practice with…" : undefined}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>

            <p className="muted m-0 text-xs">
              {showedUp
                ? `Only school staff see your feedback, not ${learnerName}.`
                : learnerConfirmed
                  ? `${learnerName} said the session happened, so school staff will be told privately and sort it out.`
                  : "School staff will be told privately. A session that didn't happen doesn't count toward your service hours."}
            </p>

            <div className="flex justify-end gap-2">
              <Button onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={pending}>
                {pending ? "Sending…" : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
