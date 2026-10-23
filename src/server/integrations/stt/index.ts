import "server-only";
import { FakeSpeechToText } from "./fake";
import type { SpeechToText } from "./types";

export type { SpeechToText } from "./types";

let stt: SpeechToText | null = null;

/** TRANSCRIPT_STT=google uses Google Cloud Speech-to-Text; anything else uses the fake (dev/tests). */
export async function getSpeechToText(): Promise<SpeechToText> {
  if (stt) return stt;
  if (process.env.TRANSCRIPT_STT === "google") {
    const { GoogleSpeechToText } = await import("./google");
    stt = new GoogleSpeechToText();
  } else {
    stt = new FakeSpeechToText();
  }
  return stt;
}

/** Tests swap in their own. */
export function setSpeechToText(s: SpeechToText | null) {
  stt = s;
}
