import "server-only";
import { auth as googleAuth } from "@googleapis/calendar";

// Credentials for acting as the Workspace organizer (domain-wide delegation), two ways:
//
// 1. Keyless (recommended on Cloud Run): the service account the app runs as signs the delegation
//    JWT through the IAM Credentials API, so no private key is stored anywhere.
//      GOOGLE_MEET_SERVICE_ACCOUNT  e.g. tierup-meet@<project>.iam.gserviceaccount.com
//    The runtime service account needs roles/iam.serviceAccountTokenCreator on that account.
//
// 2. JSON key (anywhere else):
//      GOOGLE_SERVICE_ACCOUNT_KEY   base64 of the service account's JSON key
//
// Both need GOOGLE_MEET_ORGANIZER (the Workspace user that owns the events).

export const MEET_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/meetings.space.created",
];

/**
 * Google Workspace for Education schools (GOOGLE_EDUCATION_SCHOOLS) also let TierUp read the
 * meeting's transcript. Their admin grants these scopes to TierUp's client ID.
 */
export const EDUCATION_SCOPES = [...MEET_SCOPES, "https://www.googleapis.com/auth/meetings.space.readonly"];

type OAuthClient = InstanceType<typeof googleAuth.OAuth2>;

/** Claims for a domain-wide delegation assertion (RFC 7523 JWT bearer grant). */
export function delegationClaims(serviceAccount: string, subject: string, scopes: string[], now = Date.now()) {
  const iat = Math.floor(now / 1000);
  return {
    iss: serviceAccount,
    sub: subject,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  };
}

/** Returns a function that yields an authorized client, refreshing the token as needed. */
export function organizerAuth(
  env: NodeJS.ProcessEnv = process.env,
  organizer: string | undefined = env.GOOGLE_MEET_ORGANIZER,
  scopes: string[] = MEET_SCOPES,
): () => Promise<OAuthClient> {
  if (!organizer) throw new Error("MEET_PROVIDER=google needs GOOGLE_MEET_ORGANIZER");

  if (env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    const json = JSON.parse(Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_KEY, "base64").toString("utf8")) as {
      client_email: string;
      private_key: string;
    };
    const jwt = new googleAuth.JWT({ email: json.client_email, key: json.private_key, scopes, subject: organizer });
    return async () => jwt;
  }

  const serviceAccount = env.GOOGLE_MEET_SERVICE_ACCOUNT;
  if (!serviceAccount) {
    throw new Error("MEET_PROVIDER=google needs GOOGLE_MEET_SERVICE_ACCOUNT (keyless) or GOOGLE_SERVICE_ACCOUNT_KEY");
  }

  const runtime = new googleAuth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client: OAuthClient = new googleAuth.OAuth2();
  let expiresAt = 0;

  return async () => {
    if (Date.now() < expiresAt - 5 * 60000) return client;

    // Ask IAM to sign the delegation assertion with the service account's Google-managed key.
    const signer = await runtime.getClient();
    const signed = await signer.request<{ signedJwt: string }>({
      url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signJwt`,
      method: "POST",
      data: { payload: JSON.stringify(delegationClaims(serviceAccount, organizer, scopes)) },
    });

    // Exchange it for an access token that acts as the organizer.
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signed.data.signedJwt }),
    });
    const token = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !token.access_token) {
      throw new Error(`Google token exchange failed: ${token.error ?? res.status} ${token.error_description ?? ""}`.trim());
    }
    expiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;
    client.setCredentials({ access_token: token.access_token, expiry_date: expiresAt });
    return client;
  };
}
