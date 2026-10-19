"use client";

import { useToast } from "./toast";

/** Copies text to the clipboard and confirms with a toast. */
export function CopyButton({ text, label = "Copy link", toast = "Meet link copied", className = "btn btn-ghost self-start text-[13px]" }: { text: string; label?: string; toast?: string; className?: string }) {
  const flash = useToast();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          flash(toast);
        } catch {
          flash("Couldn't copy. Select the link and copy it instead.");
        }
      }}
    >
      {label}
    </button>
  );
}
