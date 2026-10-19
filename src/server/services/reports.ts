import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";

export const REPORT_REASONS = [
  "Inappropriate messages",
  "Asked to contact off TierUp",
  "Didn't show up",
  "Made me uncomfortable",
  "Something else",
] as const;

export const reportSchema = z.object({
  againstUserId: z.string().optional(),
  sessionId: z.string().optional(),
  threadId: z.string().optional(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});

/** Anyone can report a user, session or chat. Staff at the reported user's school see it. */
export async function createReport(reporterId: string, raw: z.input<typeof reportSchema>) {
  const input = reportSchema.parse(raw);
  if (!input.againstUserId && !input.sessionId && !input.threadId) throw new UserError("Nothing to report.");
  if (input.againstUserId === reporterId) throw new UserError("You can't report yourself.");
  if (input.againstUserId && !(await db.user.findUnique({ where: { id: input.againstUserId } }))) {
    throw new UserError("That person no longer exists.");
  }
  return db.report.create({
    data: {
      reporterId,
      againstUserId: input.againstUserId,
      sessionId: input.sessionId,
      threadId: input.threadId,
      reason: input.details ? `${input.reason}: ${input.details}` : input.reason,
    },
  });
}
