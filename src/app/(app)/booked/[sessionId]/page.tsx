import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/ui/copy-button";
import { ButtonLink, Card, Tag } from "@/components/ui/primitives";
import { requireOnboarded } from "@/server/policies/session";
import { bookedView } from "@/server/services/booking";

export const metadata: Metadata = { title: "Booked" };

type Props = { params: Promise<{ sessionId: string }> };

export default async function BookedPage({ params }: Props) {
  const user = await requireOnboarded(["learner", "tutor"]);
  const { sessionId } = await params;
  const s = await bookedView(user.id, sessionId);
  if (!s) notFound();
  const sessionHref = `/sessions/${s.threadId}`;

  return (
    <div className="mx-auto flex max-w-[620px] flex-col gap-[18px] py-14">
      <span className="kicker">Booked</span>
      <h1>You&apos;re set with {s.otherName}</h1>
      <span className="muted text-base">
        {s.subjectName} · {s.when} · {s.durationMin} min
      </span>

      {s.format === "online" && s.meetUrl ? (
        <Card blueprint className="gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="card-title">One-time Google Meet created</span>
            <Tag tone="accent">Single-use</Tag>
          </div>
          <div className="border border-divider bg-surface px-3 py-2.5 font-mono text-sm break-all">{s.meetUrl.replace(/^https?:\/\//, "")}</div>
          <div className="muted grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5 text-xs">
            <span>Opens 10 min before start</span>
            <span>Expires when the session ends</span>
            <span>Only you and {s.otherName} can join</span>
            <span>Added to both calendars</span>
          </div>
          <div className="flex gap-2">
            <CopyButton text={s.meetUrl} className="btn btn-secondary" />
            <ButtonLink href={sessionHref} variant="primary">
              Go to session
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <Card className="gap-1.5 p-5">
          <span className="card-title">Meet at {s.location}</span>
          <span className="card-meta">Check in on the app when you arrive.</span>
          <ButtonLink href={sessionHref} variant="primary" className="mt-1 self-start">
            Go to session
          </ButtonLink>
        </Card>
      )}
      <Link href="/home">← Back home</Link>
    </div>
  );
}
