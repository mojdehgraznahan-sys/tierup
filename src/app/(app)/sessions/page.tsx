import type { Metadata } from "next";
import { SessionsLayout } from "@/components/sessions/sessions-layout";
import { requireOnboarded } from "@/server/policies/session";
import { listThreads } from "@/server/services/messaging";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage() {
  const user = await requireOnboarded(["learner", "tutor"]);
  const threads = await listThreads(user);

  return (
    <SessionsLayout threads={threads}>
      <div className="muted hidden items-center justify-center p-8 text-sm lg:col-span-2 lg:flex">
        {threads.length ? "Pick a chat on the left." : "Your chats and booked sessions will show up here."}
      </div>
    </SessionsLayout>
  );
}
