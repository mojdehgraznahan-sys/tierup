import type { SpeechToText } from "./types";

/** Dev/tests: no API call. Returns a fixed line (or what a test queues up). */
export class FakeSpeechToText implements SpeechToText {
  queue: string[] = [];
  calls: { bytes: number; mimeType: string }[] = [];

  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    this.calls.push({ bytes: audio.length, mimeType });
    return this.queue.shift() ?? "We worked through factoring practice problems.";
  }
}
