import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicHeader } from "@/components/app/public-header";
import { Button, Card } from "@/components/ui/primitives";
import { parentOptOutView, stopParentSummaries } from "@/server/services/parent-fyi";

export const metadata: Metadata = { title: "Session summaries", robots: { index: false } };

type Props = { params: Promise<{ token: string }> };

/** One-click opt-out from the FYI summaries a learner's parent gets (a button, so link scanners can't trigger it). */
export default async function ParentUpdatesPage({ params }: Props) {
  const { token } = await params;
  const view = await parentOptOutView(token);
  if (!view) notFound();

  async function stop() {
    "use server";
    await stopParentSummaries(token);
    redirect(`/parent-updates/${token}`);
  }

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <PublicHeader />
      <div className="mx-auto flex max-w-[560px] flex-col gap-6 pt-8">
        <div className="flex flex-col gap-2">
          <span className="kicker">Session summaries</span>
          <h1 className="text-[34px] sm:text-[40px]">{view.off ? "You won't get these anymore" : `Stop ${view.studentName}'s session summaries?`}</h1>
        </div>
        <Card className="gap-3 p-6">
          {view.off ? (
            <p className="m-0 text-sm">
              We&apos;ve stopped the FYI summaries of {view.studentName}&apos;s tutoring sessions. {view.studentName} can turn them back on in their
              TierUp settings.
            </p>
          ) : (
            <form action={stop} className="flex flex-col gap-3">
              <p className="m-0 text-sm">You&apos;ll stop getting a short summary after each of {view.studentName}&apos;s tutoring sessions. Nothing else changes.</p>
              <Button type="submit" variant="primary" className="self-start">
                Stop these emails
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
