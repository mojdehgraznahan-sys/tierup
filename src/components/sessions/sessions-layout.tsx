import clsx from "clsx";
import Link from "next/link";
import { ThreadList, type ThreadItem } from "./thread-list";

/**
 * Three columns on desktop (chats · chat · details). On small screens the chat list and the open
 * chat are separate views, and details stack under the chat.
 */
export function SessionsLayout({
  threads,
  selectedId,
  children,
}: {
  threads: ThreadItem[] | null;
  selectedId?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <h1 className="pt-8 pb-5">Sessions</h1>
      {selectedId && threads && (
        <Link href="/sessions" className="mb-3 text-[13px] lg:hidden">
          ← All chats
        </Link>
      )}
      <div
        className={clsx(
          "grid border border-divider",
          threads ? "lg:grid-cols-[220px_minmax(0,1fr)_270px]" : "lg:grid-cols-[minmax(0,1fr)_270px]",
          "lg:h-[calc(100vh-210px)] lg:min-h-[520px]",
        )}
      >
        {threads && (
          <div className={clsx("min-h-0 border-divider lg:border-r", selectedId ? "hidden lg:flex lg:flex-col" : "flex flex-col")}>
            {threads.length === 0 ? (
              <p className="muted m-0 p-4 text-sm">
                No chats yet. Message a tutor from their profile, or reply to a request.
              </p>
            ) : (
              <ThreadList threads={threads} selectedId={selectedId} />
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
