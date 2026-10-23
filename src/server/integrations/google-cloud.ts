import "server-only";
import { auth as googleAuth } from "@googleapis/calendar";

type Client = Awaited<ReturnType<InstanceType<typeof googleAuth.GoogleAuth>["getClient"]>>;
let client: Promise<Client> | null = null;

/**
 * Google Cloud APIs (Speech-to-Text, Cloud Storage) as TierUp's own service account, not a
 * Workspace user: the runtime service account on Cloud Run, or GOOGLE_SERVICE_ACCOUNT_KEY elsewhere.
 */
export function googleCloudClient(): Promise<Client> {
  client ??= (() => {
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const credentials = key ? (JSON.parse(Buffer.from(key, "base64").toString("utf8")) as { client_email: string; private_key: string }) : undefined;
    return new googleAuth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
  })();
  return client;
}

/** The Google Cloud project for Speech-to-Text and Storage. */
export async function googleCloudProject(): Promise<string> {
  const explicit = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.STT_PROJECT_ID;
  if (explicit) return explicit;
  const id = await new googleAuth.GoogleAuth().getProjectId();
  if (!id) throw new Error("Set GOOGLE_CLOUD_PROJECT for Speech-to-Text");
  return id;
}
