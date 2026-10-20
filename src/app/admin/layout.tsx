import type { Metadata } from "next";
import Link from "next/link";
import { signOutAction } from "@/app/(app)/actions";
import { Wordmark } from "@/components/ui/primitives";
import { requireAdmin } from "@/server/policies/session";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · TierUp admin" }, robots: { index: false } };

/** Platform admin area (ADMIN_EMAILS only). Separate from the school-facing app. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-divider px-4 py-3 sm:px-6">
        <div className="mr-auto flex items-baseline gap-3">
          <Wordmark href="/admin" />
          <span className="kicker">Admin</span>
        </div>
        {admin.onboardedAt && (
          <Link href="/start" className="text-sm">
            Open the app
          </Link>
        )}
        <span className="muted hidden text-xs sm:inline">{admin.email}</span>
        <form action={signOutAction}>
          <button type="submit" className="btn btn-ghost text-sm">
            Sign out
          </button>
        </form>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-16 sm:px-6">
        {children}
      </main>
    </div>
  );
}
