import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicHeader } from "@/components/app/public-header";
import { Button, Card } from "@/components/ui/primitives";
import { digestStopSignature, stopTeacherDigest } from "@/server/services/teacher-digest";

export const metadata: Metadata = { title: "Weekly tutoring digest", robots: { index: false } };

type Props = { searchParams: Promise<{ email?: string; sig?: string; done?: string }> };

/** Teachers turn off the weekly digest (signed link from the email; a button so link scanners can't). */
export default async function DigestStopPage({ searchParams }: Props) {
  const { email = "", sig = "", done } = await searchParams;
  if (!email || sig !== digestStopSignature(email)) notFound();

  async function stop() {
    "use server";
    await stopTeacherDigest(email, sig);
    redirect(`/digest/stop?email=${encodeURIComponent(email)}&sig=${sig}&done=1`);
  }

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <PublicHeader />
      <div className="mx-auto flex max-w-[560px] flex-col gap-6 pt-8">
        <div className="flex flex-col gap-2">
          <span className="kicker">Weekly tutoring digest</span>
          <h1 className="text-[34px] sm:text-[40px]">{done ? "You won't get these anymore" : "Stop the weekly digest?"}</h1>
        </div>
        <Card className="gap-3 p-6">
          {done ? (
            <p className="m-0 text-sm">We&apos;ve stopped the weekly tutoring digest for {email}.</p>
          ) : (
            <form action={stop} className="flex flex-col gap-3">
              <p className="m-0 text-sm">{email} will stop getting the weekly summary of students&apos; peer tutoring sessions.</p>
              <Button type="submit" variant="primary" className="self-start">
                Stop the weekly digest
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
