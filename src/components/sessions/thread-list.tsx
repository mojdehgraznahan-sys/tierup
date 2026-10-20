import clsx from "clsx";
import Link from "next/link";

export type ThreadItem = {
  id: string;
  subjectName: string;
  otherName: string;
  when: string | null;
  status: string;
  unread: boolean;
};

/** Left column: one row per chat; booked sessions show their time, pre-booking chats "Not booked". */
export function ThreadList({ threads, selectedId }: { threads: ThreadItem[]; selectedId?: string }) {
  return (
    <nav aria-label="Chats" className="flex min-h-0 flex-col overflow-y-auto">
      {threads.map((t) => {
        const selected = t.id === selectedId;
        return (
          <Link
            key={t.id}
            href={`/sessions/${t.id}`}
            aria-current={selected ? "page" : undefined}
            className={clsx(
              "flex flex-col gap-0.5 border-b border-divider px-4 py-3.5 text-ink no-underline hover:text-ink",
              selected ? "bg-accent-100" : "hover:bg-ink/[.03]",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <b className="h text-base">{t.subjectName}</b>
              {t.unread && <span className="size-2 shrink-0 rounded-full bg-accent-2" aria-label="Unread" />}
            </span>
            <span className={clsx("text-[13px]", t.unread ? "font-semibold" : "muted")}>
              {t.otherName} · {t.when ?? "Not booked yet"}
            </span>
            <span className="text-xs text-accent-2-700">{t.status}</span>
          </Link>
        );
      })}
    </nav>
  );
}
