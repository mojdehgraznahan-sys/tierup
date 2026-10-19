"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { sendMessageAction } from "@/app/(app)/sessions/actions";
import { Button } from "@/components/ui/primitives";
import type { MessageDTO } from "@/server/services/messaging";

const POLL_MS = 4000;

type Props = {
  threadId: string;
  title: string;
  initialMessages: MessageDTO[];
  /** Staff read along but can't post. */
  readOnly: boolean;
  /** Staff see who sent each message. */
  showSenders: boolean;
};

/** The middle column: messages (polling for new ones) and the composer. */
export function Chat({ threadId, title, initialMessages, readOnly, showSenders }: Props) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const latest = useRef(initialMessages.at(-1)?.createdAt ?? new Date(0).toISOString());
  const router = useRouter();

  // Opening a chat marks it read; refresh once so the header's unread badge catches up.
  useEffect(() => {
    if (!readOnly) router.refresh();
  }, [threadId, readOnly, router]);

  const merge = useCallback((incoming: MessageDTO[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    const newest = incoming.reduce((a, m) => (m.createdAt > a ? m.createdAt : a), latest.current);
    latest.current = newest;
  }, []);

  // Poll for new messages while the tab is visible.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/threads/${threadId}/messages?after=${encodeURIComponent(latest.current)}`, { cache: "no-store" });
        if (res.ok && !stopped) merge((await res.json()).messages);
      } catch {
        // Network blip: try again next tick.
      }
    };
    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [threadId, merge]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = () => {
    const body = draft.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await sendMessageAction(threadId, body);
      if (!result.ok) return setError(result.error);
      setDraft("");
      merge([result.message]);
    });
  };

  return (
    <section className="flex min-h-0 flex-col" aria-label={`Chat with ${title}`}>
      <header className="flex items-center justify-between gap-3 border-b border-divider px-4 py-3">
        <h2 className="truncate text-xl">{title}</h2>
        <span className="shrink-0 text-xs">School staff can view this chat</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="muted m-auto text-center text-sm">
            {readOnly ? "No messages yet." : "Say hi and agree on a topic and time."}
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={clsx("flex max-w-[80%] flex-col gap-0.5", m.mine ? "self-end items-end" : "self-start items-start")}>
            {showSenders && (
              <span className="card-meta">
                {m.senderName}
                {m.flagged && <span className="ml-2 font-semibold text-accent-2-700">⚑ Flagged</span>}
              </span>
            )}
            <div
              className={clsx(
                "border px-3 py-2 text-sm whitespace-pre-wrap break-words",
                m.flagged && showSenders
                  ? "border-accent-2-400 bg-accent-2-100"
                  : m.mine
                    ? "border-accent-200 bg-accent-100"
                    : "border-divider bg-transparent",
              )}
            >
              {m.body}
            </div>
            {m.flagged && m.mine && (
              <span className="text-[11px] text-accent-2-700">
                Sharing contact info isn&apos;t allowed on TierUp. School staff have been notified.
              </span>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {readOnly ? (
        <p className="muted m-0 border-t border-divider px-4 py-3 text-xs">You&apos;re viewing this chat as school staff.</p>
      ) : (
        <form
          className="flex flex-col gap-1.5 border-t border-divider p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {error && (
            <p role="alert" className="m-0 text-xs text-accent-2-800">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <input
              className="input"
              aria-label="Message"
              placeholder="Write a message"
              maxLength={2000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={pending || !draft.trim()}>
              Send
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
