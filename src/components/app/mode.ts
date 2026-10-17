import type { Role } from "@prisma/client";

export const MODE_COOKIE = "tierup-mode";
export type Mode = "learner" | "tutor" | "staff";

/** Which nav to show: staff stays staff; dual-role students follow their chosen mode. */
export function resolveMode(roles: Role[], cookie?: string): Mode {
  if (roles.includes("staff")) return "staff";
  if (roles.includes("learner") && roles.includes("tutor")) return cookie === "tutor" ? "tutor" : "learner";
  return roles.includes("tutor") ? "tutor" : "learner";
}

export const NAV: Record<Mode, { label: string; href: string; match: string[] }[]> = {
  learner: [
    { label: "Home", href: "/home", match: ["/home"] },
    { label: "Find help", href: "/find", match: ["/find", "/tutors"] },
    { label: "Sessions", href: "/sessions", match: ["/sessions", "/booked"] },
  ],
  tutor: [
    { label: "Dashboard", href: "/dashboard", match: ["/dashboard"] },
    { label: "Sessions", href: "/sessions", match: ["/sessions"] },
  ],
  staff: [{ label: "Moderation", href: "/staff", match: ["/staff"] }],
};
