"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  Home,
  LayoutDashboard,
  MessageCircle,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { signOutAction, switchMode } from "@/app/(app)/actions";
import { Avatar, Wordmark } from "@/components/ui/primitives";
import { NAV, type Mode } from "./mode";

type Props = {
  mode: Mode;
  canSwitch: boolean;
  homeHref: string;
  name: string;
  email: string;
  image?: string | null;
  /** Chats with unread messages (badge on "Sessions"). */
  unread: number;
};

const ICONS: Record<string, LucideIcon> = {
  "/home": Home,
  "/find": Search,
  "/sessions": MessageCircle,
  "/dashboard": LayoutDashboard,
  "/staff": ShieldCheck,
};

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-1.5 inline-grid min-w-[18px] place-items-center rounded-full bg-accent-2-700 px-1 text-[11px] leading-[18px] font-semibold text-bg">
      {count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

/**
 * Top bar on every logged-in page. On phones the section links move to a bottom tab bar
 * (wireframe 1u), leaving the wordmark, mode switch and account menu up top.
 */
export function AppHeader({
  mode,
  canSwitch,
  homeHref,
  name,
  email,
  image,
  unread,
}: Props) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const items = NAV[mode].map((item) => ({
    ...item,
    active: item.match.some(
      (m) => pathname === m || pathname.startsWith(`${m}/`),
    ),
    Icon: ICONS[item.href] ?? Home,
  }));

  return (
    <>
      <header className="flex items-center gap-x-3.5 border-b border-divider px-4 py-3 sm:gap-x-[22px] sm:px-6">
        <div className="mr-auto">
          <Wordmark slogan href={homeHref} />
        </div>
        <nav
          aria-label="Main"
          className="hidden items-center gap-[22px] sm:flex"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={clsx(
                "text-sm no-underline",
                item.active
                  ? "text-accent-700"
                  : "text-ink hover:text-accent-700",
              )}
            >
              {item.label}
              {item.href === "/sessions" && <UnreadBadge count={unread} />}
            </Link>
          ))}
        </nav>
        {canSwitch && (
          <div className="seg" role="radiogroup" aria-label="Mode">
            {(["learner", "tutor"] as const).map((m) => (
              <label key={m} className="seg-opt px-2.5 py-[5px] text-xs">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === m}
                  disabled={pending}
                  onChange={() => startTransition(() => switchMode(m))}
                />
                {m === "learner" ? "Learner" : "Tutor"}
              </label>
            ))}
          </div>
        )}
        <details className="relative">
          <summary
            className="list-none cursor-pointer rounded-full [&::-webkit-details-marker]:hidden"
            aria-label="Account menu"
          >
            <Avatar name={name} size={30} src={image} />
          </summary>
          <div className="card absolute right-0 z-30 mt-2 w-60 gap-1 bg-bg p-3 shadow-lg">
            <b className="text-sm">{name}</b>
            <span className="card-meta truncate">{email}</span>
            <div className="mt-2 border-t border-divider pt-2">
              <Link href="/settings" className="btn btn-ghost w-full justify-start no-underline">
                Settings
              </Link>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="btn btn-ghost w-full justify-start"
              >
                Sign out
              </button>
            </form>
          </div>
        </details>
      </header>

      {items.length > 1 && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-divider bg-bg pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          {items.map(({ href, label, active, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] no-underline",
                active ? "text-accent-700" : "text-ink",
              )}
            >
              <Icon size={20} strokeWidth={1.5} aria-hidden />
              <span>
                {label}
                {href === "/sessions" && <UnreadBadge count={unread} />}
              </span>
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
