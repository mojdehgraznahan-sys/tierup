import type { Summarizer, SummaryInput, SummaryResult } from "./types";

/** Dev/tests: a predictable summary built from the transcript and tutor's notes, no API call. */
export class FakeSummarizer implements Summarizer {
  calls: SummaryInput[] = [];

  async summarize(input: SummaryInput): Promise<SummaryResult> {
    this.calls.push(input);
    const lines = (input.tutorNotes ?? "").split(/[\n.]+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0 && input.messages.length === 0 && input.transcript.length === 0) return { ok: false, failure: "not_enough_info" };
    if (input.transcript.length) lines.unshift(`Discussed: ${input.transcript[0]!.text.slice(0, 60)}`);
    return {
      ok: true,
      topics: lines.length ? lines.slice(0, 3) : [`${input.subject} practice`],
      nextSteps: ["Redo two of the problems from this session without looking at the solutions."],
      model: "fake",
    };
  }
}
