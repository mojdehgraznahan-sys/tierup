import "server-only";
import { db } from "@/server/db";

/**
 * Fixed-window rate limit backed by Postgres (works across Cloud Run instances).
 * Counts one hit for `key`; returns whether it's within `limit` per `windowMs`.
 */
export async function consume(key: string, limit: number, windowMs: number, now = new Date()) {
  const row = await db.rateLimit.upsert({
    where: { key },
    create: { key, windowStart: now, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.windowStart.getTime() <= now.getTime() - windowMs) {
    // The window has passed: start a new one with this hit.
    await db.rateLimit.update({ where: { key }, data: { windowStart: now, count: 1 } });
    return { ok: true, retryAfterMs: 0 };
  }
  return { ok: row.count <= limit, retryAfterMs: row.windowStart.getTime() + windowMs - now.getTime() };
}

/** Client IP as seen behind Cloud Run / proxies (first X-Forwarded-For entry). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export const SIGNIN_LIMITS = {
  perEmail: { limit: 5, windowMs: 60 * 60 * 1000 },
  perIp: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;
