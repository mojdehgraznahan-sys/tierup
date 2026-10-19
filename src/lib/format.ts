import type { Format } from "@prisma/client";

/** "★ 4.9 (12)" or "New tutor". */
export function ratingText(rating: { avg: number; count: number } | null): string {
  return rating && rating.count > 0 ? `★ ${rating.avg.toFixed(1)} (${rating.count})` : "New tutor";
}

/** "2m ago", "1h ago", "3d ago". */
export function timeAgo(date: Date, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function sessionFormatLabel(format: Format): string {
  return format === "online" ? "Online" : "In person";
}

/** The Join button is live from 10 min before start until the session ends (BACKEND.md › Meet). */
export function joinWindow(startsAt: Date, durationMin: number, now = new Date()) {
  const opens = startsAt.getTime() - 10 * 60000;
  const closes = startsAt.getTime() + durationMin * 60000;
  return { open: now.getTime() >= opens && now.getTime() < closes, ended: now.getTime() >= closes };
}
