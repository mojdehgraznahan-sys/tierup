import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { googleCloudClient } from "./google-cloud";

/**
 * Where de-identified transcripts go after 30 days (TRANSCRIPT_ARCHIVE):
 *   gs://bucket/prefix   a Google Cloud Storage bucket (production)
 *   file:./.data/archive a local folder (development)
 * Unset: nothing is archived; transcripts are just deleted.
 */
export function archiveConfigured(): boolean {
  return !!process.env.TRANSCRIPT_ARCHIVE;
}

/** Writes one JSON document at `key` (e.g. "transcripts/2026/10/abc.json"). */
export async function writeArchive(key: string, data: unknown): Promise<void> {
  const target = process.env.TRANSCRIPT_ARCHIVE;
  if (!target) throw new Error("TRANSCRIPT_ARCHIVE is not set");
  const body = JSON.stringify(data, null, 2);

  if (target.startsWith("file:")) {
    const file = path.resolve(target.slice("file:".length), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return;
  }

  const match = /^gs:\/\/([^/]+)\/?(.*)$/.exec(target);
  if (!match) throw new Error(`TRANSCRIPT_ARCHIVE must be gs://bucket[/prefix] or file:<folder>, got ${target}`);
  const [, bucket, prefix] = match;
  const name = [prefix?.replace(/\/$/, ""), key].filter(Boolean).join("/");
  const client = await googleCloudClient();
  await client.request({
    url: `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket!)}/o?uploadType=media&name=${encodeURIComponent(name)}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: body,
  });
}
