import { cookies } from "next/headers";
import { AppHeader } from "@/components/app/app-header";
import { MODE_COOKIE, resolveMode } from "@/components/app/mode";
import { homePathFor, requireOnboarded } from "@/server/policies/session";
import { displayName } from "@/lib/names";

/** Logged-in shell. Every page under (app) requires a finished onboarding. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboarded();
  const mode = resolveMode(user.roles, (await cookies()).get(MODE_COOKIE)?.value);
  const isStaff = user.roles.includes("staff");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        mode={mode}
        canSwitch={user.roles.includes("learner") && user.roles.includes("tutor")}
        homeHref={mode === "tutor" ? "/dashboard" : homePathFor(user)}
        name={isStaff ? (user.name ?? "") : displayName(user.name)}
        email={user.email}
        image={user.image}
      />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-16 sm:px-6">{children}</main>
    </div>
  );
}
