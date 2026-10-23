/** Turns one short audio clip (up to a minute) into text. */
export interface SpeechToText {
  transcribe(audio: Buffer, mimeType: string): Promise<string>;
}
