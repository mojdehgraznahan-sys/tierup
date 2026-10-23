import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { transcriptsEnabled } from "@/server/policies/rules";
import { CONSENT_VERSION, type ConsentKind } from "@/lib/consent";

export type Consents = Record<ConsentKind, boolean>;

/** The student's latest answer for each kind (false when never asked). */
export async function currentConsents(userId: string): Promise<Consents & { askedVersion: number | null }> {
  const rows = await db.consentRecord.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const latest = (kind: ConsentKind) => rows.find((r) => r.kind === kind);
  const versions = (["analytics", ...(transcriptsEnabled() ? ["transcripts" as const] : [])] as ConsentKind[]).map((k) => latest(k)?.version ?? null);
  return {
    transcripts: latest("transcripts")?.granted ?? false,
    analytics: latest("analytics")?.granted ?? false,
    // The lowest version answered across the kinds currently asked; null when one was never answered.
    askedVersion: versions.includes(null) ? null : Math.min(...(versions as number[])),
  };
}

/** Students see the privacy pop-up until they've answered the current wording. */
export async function needsConsentPrompt(user: { id: string; roles: string[] }): Promise<boolean> {
  if (!user.roles.includes("learner") && !user.roles.includes("tutor")) return false;
  const { askedVersion } = await currentConsents(user.id);
  return askedVersion === null || askedVersion < CONSENT_VERSION;
}

export const consentSchema = z.object({ transcripts: z.boolean().optional(), analytics: z.boolean() });

/** Records the answers (append-only, so there's a history of what was agreed to and when). */
export async function recordConsents(userId: string, raw: z.input<typeof consentSchema>) {
  const input = consentSchema.parse(raw);
  const kinds: [ConsentKind, boolean][] = [["analytics", input.analytics]];
  if (input.transcripts !== undefined && transcriptsEnabled()) kinds.push(["transcripts", input.transcripts]);
  await db.consentRecord.createMany({ data: kinds.map(([kind, granted]) => ({ userId, kind, granted, version: CONSENT_VERSION })) });
  return { toast: "Privacy choices saved. You can change them anytime in Settings." };
}

/** Both students currently allow transcription. */
export async function bothAllowTranscripts(learnerId: string, tutorId: string): Promise<boolean> {
  const [a, b] = await Promise.all([currentConsents(learnerId), currentConsents(tutorId)]);
  return a.transcripts && b.transcripts;
}
