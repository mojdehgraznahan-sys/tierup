/**
 * What students agree to in the privacy pop-up. Bump CONSENT_VERSION whenever the wording changes
 * in a way that matters: everyone is asked again and their answer is recorded with the version.
 */
export const CONSENT_VERSION = 1;

export type ConsentKind = "transcripts" | "analytics";

export const CONSENT_COPY = {
  transcripts: {
    label: "Transcribe my online and in-person sessions for an AI summary",
    details: [
      "Only the words are kept as text, never audio or video. The transcript is used to write a short summary of the topics you covered and what to practice next.",
      "The summary goes to you, your tutor, your class teacher (weekly) and your parent (if we have their email). Nobody but school staff reviewing a reported problem can see the transcript itself.",
      "Transcripts are deleted from TierUp after 30 days. A copy with names and contact details removed may be kept for program research.",
      "A session is only transcribed if you and your tutor both agree, and either of you can turn it off before it starts.",
    ],
  },
  analytics: {
    label: "Let my school use my data, with my name removed, to see where students need more help",
    details: [
      "Your school sees combined numbers only (for example, which Algebra II topics students asked about most), never your name, and never groups so small that someone could be picked out.",
    ],
  },
} as const;
