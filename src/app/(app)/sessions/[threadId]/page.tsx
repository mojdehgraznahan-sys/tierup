import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Chat } from "@/components/sessions/chat";
import { SessionPanel } from "@/components/sessions/session-panel";
import { SessionsLayout } from "@/components/sessions/sessions-layout";
import { requireOnboarded } from "@/server/policies/session";
import { listThreads, threadView } from "@/server/services/messaging";

export const metadata: Metadata = { title: "Sessions" };

type Props = { params: Promise<{ threadId: string }>; searchParams: Promise<{ wrapup?: string }> };

export default async function ThreadPage({ params, searchParams }: Props) {
  const user = await requireOnboarded();
  const { threadId } = await params;
  const { wrapup } = await searchParams;
  const view = await threadView(user, threadId);
  if (!view) notFound();

  const staff = view.role === "staff";
  // Staff aren't participants, so they get the chat without a thread list.
  const threads = staff ? null : await listThreads(user);
  const title = staff
    ? `${view.tutor.name} → ${view.learner.name}`
    : view.role === "tutor"
      ? view.learner.name
      : view.tutor.name;

  return (
    <SessionsLayout threads={threads} selectedId={view.id}>
      <div className="flex min-h-[420px] flex-col border-divider lg:min-h-0 lg:border-r">
        <Chat key={view.id} threadId={view.id} title={title} initialMessages={view.messages} readOnly={staff} showSenders={staff} />
      </div>
      <div className="border-t border-divider lg:overflow-y-auto lg:border-t-0">
        <SessionPanel view={view} openWrapUp={wrapup === "1"} />
      </div>
    </SessionsLayout>
  );
}
