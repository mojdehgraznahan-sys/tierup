import Link from "next/link";
import { Wordmark } from "@/components/ui/primitives";

/** Top bar for public and pre-onboarding pages (landing, login, onboarding, consent). */
export function PublicHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between py-[18px]">
      <Wordmark />
      <nav className="flex items-center gap-[18px]">{right}</nav>
    </header>
  );
}

export function ExitLink({ href = "/" }: { href?: string }) {
  return <Link href={href}>✕ Exit</Link>;
}
