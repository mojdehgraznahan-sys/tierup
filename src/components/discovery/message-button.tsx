"use client";

import { useTransition } from "react";
import { messageTutorAction } from "@/app/(app)/discovery-actions";
import { useToast } from "@/components/ui/toast";

type Props = { tutorId: string; subjectId?: string; seedResponseId?: string; className?: string };

/** Opens (or creates) the pre-booking chat with a tutor. */
export function MessageButton({ tutorId, subjectId, seedResponseId, className = "btn btn-secondary" }: Props) {
  const flash = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await messageTutorAction({ tutorId, subjectId, seedResponseId });
          if (result && !result.ok) flash(result.error);
        })
      }
    >
      {pending ? "Opening…" : "Message"}
    </button>
  );
}
