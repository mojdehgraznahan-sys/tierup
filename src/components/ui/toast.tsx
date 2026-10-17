"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const TOAST_MS = 2600;

const ToastContext = createContext<(message: string) => void>(() => {});

/** Bottom-center confirmation pill that auto-dismisses after ~2.6s. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flash = useCallback((msg: string) => {
    clearTimeout(timer.current);
    setMessage(msg);
    timer.current = setTimeout(() => setMessage(null), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={flash}>
      {children}
      <div role="status" aria-live="polite">
        {message && <div className="toast">{message}</div>}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Shows a toast once on mount, e.g. after a redirect (`?toast=` param). */
export function FlashOnMount({ message }: { message?: string | null }) {
  const flash = useToast();
  useEffect(() => {
    if (message) flash(message);
  }, [message, flash]);
  return null;
}
