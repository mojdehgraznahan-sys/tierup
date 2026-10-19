// Flags attempts to move a conversation off TierUp (BACKEND.md › Moderation & privacy).
// Matches are reported to staff; the message is still delivered so the record is complete.

const PATTERNS: [kind: string, re: RegExp][] = [
  ["phone number", /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/],
  ["email address", /[\w.+-]+@[\w-]+\.[a-z]{2,}/i],
  ["social handle", /(?:^|\s)@[a-z0-9_.]{3,}/i],
  ["social app", /\b(?:snap(?:chat)?|insta(?:gram)?|tiktok|discord|whats ?app|telegram|signal app|kik)\b/i],
  ["request to talk elsewhere", /\b(?:text|call|dm|facetime) me\b|\bmy (?:number|cell|phone|snap|insta|handle)\b/i],
];

/** The kinds of off-platform contact a message seems to contain (empty if none). */
export function detectContactInfo(body: string): string[] {
  return PATTERNS.filter(([, re]) => re.test(body)).map(([kind]) => kind);
}
