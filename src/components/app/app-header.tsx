"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
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
};

export function AppHeader({ mode, canSwitch, homeHref, name, email, image }: Props) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <nav className="flex flex-wrap items-center gap-x-[22px] gap-y-2 border-b border-divider px-4 py-3 sm:px-6">
      <div className="mr-auto">
        <Wordmark slogan href={homeHref} />
      </div>
      {NAV[mode].map((item) => {
        const active = item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={clsx("text-sm no-underline", active ? "text-accent-700" : "text-ink hover:text-accent-700")}
          >
            {item.label}
          </Link>
        );
      })}
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
        <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden" aria-label="Account menu">
          <Avatar name={name} size={30} src={image} />
        </summary>
        <div className="card absolute right-0 z-30 mt-2 w-60 gap-1 bg-bg p-3 shadow-lg">
          <b className="text-sm">{name}</b>
          <span className="card-meta truncate">{email}</span>
          <form action={signOutAction} className="mt-2 border-t border-divider pt-2">
            <button type="submit" className="btn btn-ghost w-full justify-start">
              Sign out
            </button>
          </form>
        </div>
      </details>
    </nav>
  );
}
