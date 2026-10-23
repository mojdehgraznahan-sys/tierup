"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Open state + keyboard behavior for a `.dialog`: focus moves into it (a checked radio first),
 * Escape closes it, and focus returns to the trigger.
 */
export function useDialog(defaultOpen = false) {
  const [open, setOpen] = useState(defaultOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = trigger.current;
    dialog.current?.querySelector<HTMLElement>("input:checked, input, textarea, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  return { open, setOpen, trigger, dialog };
}
