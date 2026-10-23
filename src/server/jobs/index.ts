import "server-only";
import { db } from "@/server/db";
import { sendEmailSafely } from "@/server/email/send";
import {
  hoursDigestEmail,
  reminderEmail,
  requestExpiredEmail,
  staffReportAlertEmail,
  unreadMessagesEmail,
} from "@/server/email/templates";
import { getMeetProvider } from "@/server/integrations/meet";
import { sendApprovalReminders } from "@/server/services/approval-notifications";
import { sessionWhen } from "@/server/services/sessions";
import { summarizeSessions } from "@/server/services/summaries";
import { archiveOldTranscripts } from "@/server/services/transcript-archive";
import { finishTranscripts } from "@/server/services/transcripts";
import { displayName } from "@/lib/names";

// Background jobs (BACKEND.md › Notifications, Request expiry, Meet). Each is idempotent: it marks
// what it handled, so running it twice (or overlapping runs) never double-sends.

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const MIN = 60000;

/** Closes requests past their 48-hour expiry and tells the learner. */
export async function expireRequests(now = new Date()) {
  const due = await db.helpRequest.findMany({
    where: { status: "open", expiresAt: { lte: now } },
    include: { learner: { select: { email: true } }, subject: true, _count: { select: { responses: true } } },
  });
  let expired = 0;
  for (const r of due) {
    const { count } = await db.helpRequest.updateMany({ where: { id: r.id, status: "open" }, data: { status: "expired" } });
    if (count === 0) continue;
    expired++;
    await sendEmailSafely(
      requestExpiredEmail({ to: r.learner.email, subject: r.subject.name, description: r.description, replies: r._count.responses, url: `${appUrl()}/find?subject=${r.subjectId}` }),
    );
  }
  return { expired };
}

/** Emails both students about 1 hour before each confirmed session (BACKEND.md › reminder 1h before). */
export async function sendReminders(now = new Date()) {
  const due = await db.tutoringSession.findMany({
    where: { status: "confirmed", reminderSentAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + 60 * MIN) } },
    include: { subject: true, tutor: true, learner: { include: { school: { include: { slots: true } } } } },
  });
  let reminded = 0;
  for (const s of due) {
    const { count } = await db.tutoringSession.updateMany({ where: { id: s.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (count === 0) continue;
    reminded++;
    const when = sessionWhen(s.startsAt, new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label])));
    const where = s.format === "online" ? "Google Meet" : (s.location ?? "School");
    const url = `${appUrl()}/sessions/${s.threadId}`;
    for (const [to, other] of [
      [s.learner.email, s.tutor.name],
      [s.tutor.email, s.learner.name],
    ] as const) {
      await sendEmailSafely(reminderEmail({ to, otherName: displayName(other), subject: s.subject.name, when, where, meetUrl: s.meetUrl, url }));
    }
  }
  return { reminded };
}

/** Ends each session's Meet conference once the session is over, so the link can't be reused. */
export async function endMeetings(now = new Date()) {
  const candidates = await db.tutoringSession.findMany({
    where: {
      format: "online",
      meetEndedAt: null,
      meetSpaceName: { not: null },
      status: { in: ["confirmed", "completed", "no_show"] },
      startsAt: { lt: now },
    },
  });
  const provider = await getMeetProvider();
  let ended = 0;
  for (const s of candidates.filter((c) => c.startsAt.getTime() + c.durationMin * MIN <= now.getTime())) {
    try {
      await provider.endMeeting({ spaceName: s.meetSpaceName, organizer: s.meetOrganizer });
      await db.tutoringSession.update({ where: { id: s.id }, data: { meetEndedAt: now } });
      ended++;
    } catch (err) {
      console.error(`Couldn't end the Meet for session ${s.id}; will retry`, err);
    }
  }
  return { ended };
}

/** Emails staff at the involved school(s) about each new report. */
export async function alertStaffOfReports(now = new Date()) {
  const reports = await db.report.findMany({
    where: { staffNotifiedAt: null },
    include: { againstUser: { select: { name: true, schoolId: true } }, reporter: { select: { schoolId: true } } },
  });
  let alerted = 0;
  for (const r of reports) {
    const { count } = await db.report.updateMany({ where: { id: r.id, staffNotifiedAt: null }, data: { staffNotifiedAt: now } });
    if (count === 0) continue;
    const schools = [...new Set([r.againstUser?.schoolId, r.reporter?.schoolId].filter((s): s is string => !!s))];
    const staff = await db.user.findMany({ where: { roles: { has: "staff" }, schoolId: { in: schools } }, select: { email: true } });
    for (const s of staff) {
      await sendEmailSafely(
        staffReportAlertEmail({ to: s.email, number: r.number, reason: r.reason, against: r.againstUser ? displayName(r.againstUser.name) : null, url: `${appUrl()}/staff?tab=reports` }),
      );
    }
    alerted++;
  }
  return { alerted };
}

/**
 * Emails a participant when a message has sat unread for 15+ minutes. At most one email per
 * side per batch of unread messages (the "emailed at" mark resets when they read or a newer batch starts).
 */
export async function emailUnreadMessages(now = new Date(), delayMinutes = 15) {
  const cutoff = new Date(now.getTime() - delayMinutes * MIN);
  const threads = await db.thread.findMany({
    where: { lastMessageAt: { lte: cutoff, gt: new Date(now.getTime() - 7 * 24 * 60 * MIN) } },
    include: {
      learner: { select: { id: true, name: true, email: true } },
      tutor: { select: { id: true, name: true, email: true } },
      subject: true,
    },
  });
  let emailed = 0;
  for (const t of threads) {
    for (const side of ["learner", "tutor"] as const) {
      const me = t[side];
      const other = side === "learner" ? t.tutor : t.learner;
      const lastRead = side === "learner" ? t.learnerLastReadAt : t.tutorLastReadAt;
      const lastEmailed = side === "learner" ? t.learnerEmailedAt : t.tutorEmailedAt;
      const since = [lastRead, lastEmailed].reduce<Date>((a, d) => (d && d > a ? d : a), new Date(0));
      const unread = await db.message.count({ where: { threadId: t.id, senderId: other.id, createdAt: { gt: since, lte: cutoff } } });
      if (unread === 0) continue;
      const field = side === "learner" ? "learnerEmailedAt" : "tutorEmailedAt";
      const { count } = await db.thread.updateMany({
        // Compare-and-set on the previous value, so overlapping runs send one email.
        where: { id: t.id, [field]: lastEmailed },
        data: { [field]: now },
      });
      if (count === 0) continue;
      emailed++;
      await sendEmailSafely(
        unreadMessagesEmail({ to: me.email, fromName: displayName(other.name), subject: t.subject.name, count: unread, url: `${appUrl()}/sessions/${t.id}` }),
      );
    }
  }
  return { emailed };
}

/** Daily: tells each school's staff how many hours are waiting for sign-off. */
export async function hoursDigest() {
  const waiting = await db.hourLog.findMany({
    where: { status: "logged" },
    include: { tutor: { select: { schoolId: true } }, session: { select: { learnerConfirmedAt: true } } },
  });
  const bySchool = new Map<string, { count: number; hours: number; confirmed: number }>();
  for (const l of waiting) {
    if (!l.tutor.schoolId) continue;
    const agg = bySchool.get(l.tutor.schoolId) ?? { count: 0, hours: 0, confirmed: 0 };
    agg.count++;
    agg.hours += Number(l.hours);
    if (l.session.learnerConfirmedAt) agg.confirmed++;
    bySchool.set(l.tutor.schoolId, agg);
  }
  let emailed = 0;
  for (const [schoolId, agg] of bySchool) {
    const staff = await db.user.findMany({ where: { roles: { has: "staff" }, schoolId }, select: { email: true } });
    for (const s of staff) {
      await sendEmailSafely(
        hoursDigestEmail({ to: s.email, count: agg.count, hours: Math.round(agg.hours * 100) / 100, confirmed: agg.confirmed, url: `${appUrl()}/staff?tab=hours` }),
      );
      emailed++;
    }
  }
  return { emailed };
}

/** Drops rate-limit counters whose window ended over a day ago. */
export async function cleanupRateLimits(now = new Date()) {
  const { count } = await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * MIN) } } });
  return { deleted: count };
}

/** Frequent jobs, safe to run every few minutes. The digest runs separately, once a day. */
export const JOBS = {
  "expire-requests": expireRequests,
  reminders: sendReminders,
  "end-meetings": endMeetings,
  "report-alerts": alertStaffOfReports,
  "unread-messages": emailUnreadMessages,
  "hours-digest": hoursDigest,
  "cleanup-rate-limits": cleanupRateLimits,
  "approval-reminders": sendApprovalReminders,
  transcripts: () => finishTranscripts(),
  "session-summaries": () => summarizeSessions(),
  "archive-transcripts": () => archiveOldTranscripts(),
} as const;

export type JobName = keyof typeof JOBS;
export const FREQUENT: JobName[] = ["expire-requests", "reminders", "end-meetings", "report-alerts", "unread-messages", "cleanup-rate-limits", "approval-reminders", "transcripts", "session-summaries", "archive-transcripts"];
