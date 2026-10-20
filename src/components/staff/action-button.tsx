"use client";

import clsx from "clsx";
import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/server/errors";

type Props = {
  /** A server action already bound to its arguments. */
  action: () => Promise<ActionResult<{ toast: string }>>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  title?: string;
  /** Ask before running (for actions that affect other people). */
  confirm?: string;
  className?: string;
};

/** Runs a staff action and confirms with a toast; the page revalidates on the server. */
export function ActionButton({ action, children, variant = "secondary", disabled, title, confirm, className }: Props) {
  const flash = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || pending}
      className={clsx("btn", `btn-${variant}`, className)}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        startTransition(async () => {
          const result = await action();
          flash(result.ok ? result.toast : result.error);
        });
      }}
    >
      {children}
    </button>
  );
}
