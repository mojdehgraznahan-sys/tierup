import "server-only";
import { FakeSummarizer } from "./fake";
import type { Summarizer } from "./types";

export type { Summarizer, SummaryInput, SummaryResult } from "./types";

let summarizer: Summarizer | null | undefined;

/**
 * AI_SUMMARIES=claude uses the Claude API (needs ANTHROPIC_API_KEY), =fake uses the offline fake
 * (dev/previews). Unset turns summaries off.
 */
export async function getSummarizer(): Promise<Summarizer | null> {
  if (summarizer !== undefined) return summarizer;
  if (process.env.AI_SUMMARIES === "claude") {
    const { ClaudeSummarizer } = await import("./claude");
    summarizer = new ClaudeSummarizer();
  } else if (process.env.AI_SUMMARIES === "fake") {
    summarizer = new FakeSummarizer();
  } else {
    summarizer = null;
  }
  return summarizer;
}

/** Tests swap in their own summarizer (or null for "off"). */
export function setSummarizer(s: Summarizer | null | undefined) {
  summarizer = s;
}
