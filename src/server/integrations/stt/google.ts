import "server-only";
import { googleCloudClient, googleCloudProject } from "../google-cloud";
import type { SpeechToText } from "./types";

type RecognizeResponse = { results?: { alternatives?: { transcript?: string }[] }[] };

/**
 * Google Cloud Speech-to-Text v2, synchronous recognize (clips up to a minute). The audio is sent
 * as-is (WebM/Opus from Chrome and Firefox, MP4/AAC from Safari) and auto-detected.
 * STT_LOCATION (default "us") and STT_MODEL (default "chirp_3") pick the model.
 */
export class GoogleSpeechToText implements SpeechToText {
  async transcribe(audio: Buffer): Promise<string> {
    const location = process.env.STT_LOCATION ?? "us";
    const host = location === "global" ? "speech.googleapis.com" : `${location}-speech.googleapis.com`;
    const recognizer = `projects/${await googleCloudProject()}/locations/${location}/recognizers/_`;
    const client = await googleCloudClient();
    const res = await client.request<RecognizeResponse>({
      url: `https://${host}/v2/${recognizer}:recognize`,
      method: "POST",
      data: {
        config: { autoDecodingConfig: {}, model: process.env.STT_MODEL ?? "chirp_3", languageCodes: [process.env.STT_LANGUAGE ?? "en-US"] },
        content: audio.toString("base64"),
      },
    });
    return (res.data.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
  }
}
