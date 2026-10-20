import { cookies } from "next/headers";
import { AppHeader } from "@/components/app/app-header";
import { MODE_COOKIE, resolveMode } from "@/components/app/mode";
import { homePathFor, requireOnboarded } from "@/server/policies/session";
import { unreadCount } from "@/server/services/messaging";
import { displayName } from "@/lib/names";

/** Logged-in shell. Every page under (app) requires a finished onboarding. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboarded();
  const mode = resolveMode(user.roles, (await cookies()).get(MODE_COOKIE)?.value);
  const isStaff = user.roles.includes("staff");
  const unread = isStaff ? 0 : await unreadCount(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 bg-ink px-3 py-2 text-bg focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <AppHeader
        mode={mode}
        canSwitch={user.roles.includes("learner") && user.roles.includes("tutor")}
        homeHref={mode === "tutor" ? "/dashboard" : homePathFor(user)}
        name={isStaff ? (user.name ?? "") : displayName(user.name)}
        email={user.email}
        image={user.image}
        unread={unread}
      />
      <main id="main" tabIndex={-1} className={`mx-auto w-full max-w-[1120px] flex-1 px-4 outline-none sm:px-6 sm:pb-16 ${isStaff ? "pb-16" : "pb-24"}`}>
        {children}
      </main>
    </div>
  );
}
