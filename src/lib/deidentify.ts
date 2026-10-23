import { createHash } from "node:crypto";

/** Stable, one-way code for a user: the same student gets the same code, but it can't be reversed. */
export function pseudonym(userId: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${userId}`).digest("hex").slice(0, 16);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Removes names (each word of each name, as whole words) and contact details from transcript text.
 * Names map to their role ("[Tutor]"), so the text still reads naturally.
 */
export function redact(text: string, people: { role: string; name: string | null }[]): string {
  const out = text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
    .replace(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone]")
    .replace(/(^|\s)@[a-z0-9_.]{3,}/gi, "$1[handle]");
  // One pass over all name words, so a replacement like "[Tutor]" is never matched again.
  const roleOf = new Map<string, string>();
  for (const p of people) {
    for (const word of (p.name ?? "").split(/\s+/).map((w) => w.replace(/\.$/, "")).filter((w) => w.length > 1)) {
      if (!roleOf.has(word.toLowerCase())) roleOf.set(word.toLowerCase(), p.role);
    }
  }
  if (roleOf.size === 0) return out;
  const words = [...roleOf.keys()].sort((a, b) => b.length - a.length).map(escape);
  return out.replace(new RegExp(`\\b(?:${words.join("|")})\\b`, "gi"), (m) => `[${roleOf.get(m.toLowerCase())}]`);
}
