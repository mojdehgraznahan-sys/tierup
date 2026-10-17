import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/app/public-header";
import { Card } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <PublicHeader />
      <div className="mx-auto flex max-w-[440px] flex-col gap-6 pt-10 sm:pt-16">
        <Card blueprint kicker="Almost there" className="gap-3 p-6">
          <h2 className="text-[28px]">Check your email</h2>
          <p className="muted m-0">
            We sent you a sign-in link. It works once and expires in 24 hours. You can close this tab.
          </p>
          <p className="muted m-0 text-[13px]">
            Nothing yet? Check spam, or <Link href="/login">try again</Link>.
          </p>
        </Card>
      </div>
    </main>
  );
}
