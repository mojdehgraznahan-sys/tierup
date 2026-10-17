"use client";

import { useTransition } from "react";
import { resendConsentAction } from "@/app/(app)/actions";
import { useToast } from "@/components/ui/toast";

type Props = { status: "pending" | "declined"; parentEmail: string; blocked: "book" | "tutor" };

/** Shown to students until a parent approves; booking and tutoring stay locked until then. */
export function ConsentBanner({ status, parentEmail, blocked }: Props) {
  const flash = useToast();
  const [pending, startTransition] = useTransition();

  const resend = () =>
    startTransition(async () => {
      const result = await resendConsentAction();
      flash(result.ok ? result.toast : result.error);
    });

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 border border-accent-2-300 bg-accent-2-100 px-4 py-3 text-sm text-accent-2-800">
      <span>
        {status === "pending"
          ? `Waiting for your parent (${parentEmail}) to approve. You can browse, but you can't ${blocked} yet.`
          : `Your parent declined consent, so you can't ${blocked}. Ask them to open the link again if they change their mind.`}
      </span>
      <button type="button" className="btn btn-secondary bg-bg" onClick={resend} disabled={pending}>
        {pending ? "Sending…" : "Resend link"}
      </button>
    </div>
  );
}
