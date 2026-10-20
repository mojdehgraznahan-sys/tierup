import "server-only";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { hasParentConsent, MESSAGING_BEFORE_CONSENT } from "@/server/policies/rules";
import { sessionWhen } from "@/server/services/sessions";
import { detectContactInfo } from "@/lib/moderation";
import { displayName } from "@/lib/names";

const PAGE = 200;
const RATE_LIMIT_PER_MINUTE = 20;

type Viewer = { id: string; roles: Role[]; schoolId: string | null };
export type ThreadRole = "learner" | "tutor" | "staff";

export type MessageDTO = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  mine: boolean;
  flagged: boolean;
};

const threadInclude = {
  learner: { select: { id: true, name: true, schoolId: true, school: { include: { slots: true } } } },
  tutor: { select: { id: true, name: true, schoolId: true, tutorStatus: true } },
  subject: true,
  session: { include: { review: true, cancelledBy: { select: { id: true, name: true } } } },
} as const;

/**
 * Who may see a thread: its learner and tutor, plus staff at either person's school
 * ("School staff can view this chat"). Returns null when the viewer has no access.
 */
export function threadRole(
  viewer: Viewer,
  thread: { learnerId: string; tutorId: string; learner: { schoolId: string | null }; tutor: { schoolId: string | null } },
): ThreadRole | null {
  if (thread.learnerId === viewer.id) return "learner";
  if (thread.tutorId === viewer.id) return "tutor";
  if (
    viewer.roles.includes("staff") &&
    viewer.schoolId &&
    (thread.learner.schoolId === viewer.schoolId || thread.tutor.schoolId === viewer.schoolId)
  ) {
    return "staff";
  }
  return null;
}

async function loadThread(viewer: Viewer, threadId: string) {
  const thread = await db.thread.findUnique({ where: { id: threadId }, include: threadInclude });
  if (!thread) return null;
  const role = threadRole(viewer, thread);
  return role ? { thread, role } : null;
}

function toDTO(viewer: Viewer, m: { id: string; body: string; createdAt: Date; senderId: string; flagged: boolean; sender: { name: string | null } }): MessageDTO {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    senderId: m.senderId,
    senderName: displayName(m.sender.name),
    mine: m.senderId === viewer.id,
    flagged: m.flagged,
  };
}

async function markRead(threadId: string, role: ThreadRole) {
  if (role === "staff") return;
  await db.thread.update({
    where: { id: threadId },
    data: role === "learner" ? { learnerLastReadAt: new Date() } : { tutorLastReadAt: new Date() },
  });
}

const STATUS_LABEL = { requested: "Requested", confirmed: "Confirmed", completed: "Done", no_show: "No-show", cancelled: "Cancelled" } as const;

/** The viewer's threads (as learner or tutor), most recent activity first. */
export async function listThreads(viewer: Viewer) {
  const threads = await db.thread.findMany({
    where: { OR: [{ learnerId: viewer.id }, { tutorId: viewer.id }] },
    include: { ...threadInclude, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { lastMessageAt: "desc" },
  });
  // Upcoming booked sessions first (soonest first), then everything else by latest activity.
  const now = Date.now();
  const upcoming = (t: (typeof threads)[number]) =>
    t.session?.status === "confirmed" && t.session.startsAt.getTime() + t.session.durationMin * 60000 > now;
  threads.sort((a, b) => {
    const ua = upcoming(a);
    const ub = upcoming(b);
    if (ua !== ub) return ua ? -1 : 1;
    if (ua && ub) return a.session!.startsAt.getTime() - b.session!.startsAt.getTime();
    return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
  });

  return threads.map((t) => {
    const asLearner = t.learnerId === viewer.id;
    const other = asLearner ? t.tutor : t.learner;
    const lastRead = asLearner ? t.learnerLastReadAt : t.tutorLastReadAt;
    const last = t.messages[0];
    const labels = new Map((t.learner.school?.slots ?? []).map((s) => [s.startMinute, s.label]));
    return {
      id: t.id,
      subjectName: t.subject.name,
      otherName: displayName(other.name),
      when: t.session ? sessionWhen(t.session.startsAt, labels) : null,
      status: t.session ? STATUS_LABEL[t.session.status] : "Not booked",
      unread: !!last && last.senderId !== viewer.id && (!lastRead || last.createdAt > lastRead),
    };
  });
}

/** Everything the Sessions page needs for one thread. Marks it read for participants. */
export async function threadView(viewer: Viewer, threadId: string) {
  const found = await loadThread(viewer, threadId);
  if (!found) return null;
  const { thread, role } = found;

  const messages = await db.message.findMany({
    where: { threadId },
    include: { sender: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: PAGE,
  });
  await markRead(threadId, role);

  const labels = new Map((thread.learner.school?.slots ?? []).map((s) => [s.startMinute, s.label]));
  const s = thread.session;
  return {
    id: thread.id,
    role,
    learner: { id: thread.learner.id, name: displayName(thread.learner.name) },
    tutor: { id: thread.tutor.id, name: displayName(thread.tutor.name) },
    subject: { id: thread.subjectId, name: thread.subject.name },
    session: s
      ? {
          id: s.id,
          status: s.status,
          statusLabel: STATUS_LABEL[s.status],
          when: sessionWhen(s.startsAt, labels),
          startsAt: s.startsAt,
          durationMin: s.durationMin,
          format: s.format,
          location: s.location,
          meetUrl: s.meetUrl,
          started: s.startsAt.getTime() <= Date.now(),
          tutorNotes: role === "learner" ? null : s.tutorNotes,
          cancelledBy: s.cancelledBy ? displayName(s.cancelledBy.name) : null,
          cancelledByMe: s.cancelledById === viewer.id,
          cancelReason: s.cancelReason,
          review: s.review
            ? { happened: s.review.happened, stars: s.review.stars, tags: s.review.tags, comment: s.review.comment }
            : null,
        }
      : null,
    messages: messages.reverse().map((m) => toDTO(viewer, m)),
  };
}

/** Messages newer than `after` (for polling). Marks the thread read. */
export async function messagesSince(viewer: Viewer, threadId: string, after: Date) {
  const found = await loadThread(viewer, threadId);
  if (!found) throw new UserError("You don't have access to this chat.");
  const messages = await db.message.findMany({
    where: { threadId, createdAt: { gt: after } },
    include: { sender: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: PAGE,
  });
  if (messages.length) await markRead(threadId, found.role);
  return messages.map((m) => toDTO(viewer, m));
}

const bodySchema = z.string().trim().min(1, "Type a message").max(2000, "Messages can be up to 2,000 characters");

/**
 * Sends a message. Only the learner and tutor can send (staff read only). Messages that look like
 * off-platform contact are delivered but flagged, and an automatic report goes to staff.
 */
export async function sendMessage(viewer: Viewer, threadId: string, rawBody: string) {
  const body = bodySchema.parse(rawBody);
  const found = await loadThread(viewer, threadId);
  if (!found) throw new UserError("You don't have access to this chat.");
  const { thread, role } = found;
  if (role === "staff") throw new UserError("Staff can read chats but not post in them.");

  const me = await db.user.findUniqueOrThrow({ where: { id: viewer.id }, include: { consent: true, tutorStatus: true } });
  if (!MESSAGING_BEFORE_CONSENT && !hasParentConsent(me)) throw new UserError("You can message once your parent approves.");
  if (role === "tutor" && me.tutorStatus?.paused) throw new UserError("Your tutoring is paused, so you can't send messages.");

  const recent = await db.message.count({ where: { senderId: viewer.id, createdAt: { gt: new Date(Date.now() - 60000) } } });
  if (recent >= RATE_LIMIT_PER_MINUTE) throw new UserError("You're sending messages too fast. Wait a minute and try again.");

  const flags = detectContactInfo(body);
  const message = await db.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: { threadId, senderId: viewer.id, body, flagged: flags.length > 0 },
      include: { sender: { select: { name: true } } },
    });
    await tx.thread.update({
      where: { id: threadId },
      data: { lastMessageAt: m.createdAt, ...(role === "learner" ? { learnerLastReadAt: m.createdAt } : { tutorLastReadAt: m.createdAt }) },
    });
    if (flags.length) {
      // One open automatic report per thread; later flags attach to the same thread for staff to read.
      const open = await tx.report.findFirst({ where: { threadId, automatic: true, status: "new" } });
      if (!open) {
        await tx.report.create({
          data: {
            automatic: true,
            againstUserId: viewer.id,
            threadId,
            sessionId: thread.session?.id,
            messageId: m.id,
            reason: `Possible off-platform contact (auto-flagged: ${flags.join(", ")})`,
          },
        });
      }
    }
    return m;
  });

  return toDTO(viewer, message);
}

/** Number of threads with unread messages, for the nav badge. */
export async function unreadCount(viewerId: string): Promise<number> {
  const [row] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n FROM "Thread" t
    WHERE (t."learnerId" = ${viewerId} OR t."tutorId" = ${viewerId})
      AND EXISTS (
        SELECT 1 FROM "Message" m
        WHERE m."threadId" = t.id AND m."senderId" <> ${viewerId}
          AND m."createdAt" > COALESCE(CASE WHEN t."learnerId" = ${viewerId} THEN t."learnerLastReadAt" ELSE t."tutorLastReadAt" END, 'epoch'::timestamp)
      )`;
  return Number(row?.n ?? 0);
}
