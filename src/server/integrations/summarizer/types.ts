/** What the summarizer sees. Never includes the tutor's staff-only feedback or the learner's review. */
export type SummaryInput = {
  subject: string;
  when: string;
  durationMin: number;
  tutorNotes: string | null;
  /** The session transcript, oldest line first (empty when the session wasn't transcribed). */
  transcript: { speaker: string; at: Date; text: string }[];
  /** Chat up to a day after the session, oldest first. Flagged messages are left out. */
  messages: { from: "Tutor" | "Learner"; at: Date; body: string }[];
};

export type SummaryResult =
  | { ok: true; topics: string[]; nextSteps: string[]; model: string }
  | { ok: false; failure: "not_enough_info" | "refusal" };

export interface Summarizer {
  summarize(input: SummaryInput): Promise<SummaryResult>;
}
