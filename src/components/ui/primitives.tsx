import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** The four "+" registration marks of a blueprint frame. Parent needs `.blueprint`. */
export function Corners() {
  return (
    <>
      <i className="corner tl" aria-hidden />
      <i className="corner tr" aria-hidden />
      <i className="corner bl" aria-hidden />
      <i className="corner br" aria-hidden />
    </>
  );
}

type CardProps = ComponentProps<"div"> & { blueprint?: boolean; kicker?: ReactNode };

/** Hairline card. `blueprint` adds corner marks; `kicker` renders the pink sub-label. */
export function Card({ blueprint, kicker, className, children, ...rest }: CardProps) {
  return (
    <div className={clsx("card", blueprint && "blueprint", className)} {...rest}>
      {blueprint && <Corners />}
      {kicker && <div className="kicker">{kicker}</div>}
      {children}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost";
const variantClass = (v: Variant) => `btn-${v}`;

export function Button({
  variant = "secondary",
  size,
  blueprint,
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: "lg"; blueprint?: boolean }) {
  return (
    <button
      className={clsx("btn", variantClass(variant), size === "lg" && "btn-lg", blueprint && "blueprint", className)}
      {...rest}
    >
      {children}
      {blueprint && <Corners />}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size,
  blueprint,
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: "lg"; blueprint?: boolean }) {
  return (
    <Link
      className={clsx("btn", variantClass(variant), size === "lg" && "btn-lg", blueprint && "blueprint", className)}
      {...rest}
    >
      {children}
      {blueprint && <Corners />}
    </Link>
  );
}

export function Tag({
  tone = "neutral",
  className,
  ...rest
}: ComponentProps<"span"> & { tone?: "accent" | "accent-2" | "neutral" | "outline" }) {
  return <span className={clsx("tag", `tag-${tone}`, className)} {...rest} />;
}

export function Avatar({ name, size = 38, src }: { name?: string | null; size?: number; src?: string | null }) {
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} />
      ) : (
        initials(name)
      )}
    </div>
  );
}

export function initials(name?: string | null) {
  if (!name) return "";
  return name
    .replace(/\./g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

/** Wordmark; `slogan` adds the pink "Team Up, TierUp" used in the logged-in header. */
export function Wordmark({ slogan, href = "/" }: { slogan?: boolean; href?: string }) {
  return (
    <Link href={href} className="flex items-baseline gap-2.5 text-ink no-underline hover:text-ink">
      <span className="h text-[22px]">TierUp</span>
      {slogan && <span className="hidden text-xs font-medium tracking-[.04em] text-accent-2 sm:inline">Team Up, TierUp</span>}
    </Link>
  );
}
