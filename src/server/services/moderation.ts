import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { sendEmailSafely } from "@/server/email/send";
import {
  hoursDecisionEmail,
  pausedEmail,
  reportParentEmail,
  sessionCancelledEmail,
  subjectDecisionEmail,
  warningEmail,
} from "@/server/email/templates";
import { getMeetProvider } from "@/server/integrations/meet";
import { sessionWhen } from "@/server/services/sessions";
import { displayName, gradeLabel } from "@/lib/names";
import { shortDay } from "@/lib/time";

// Staff moderation (SCREENS.md › 11). Every function is scoped to the staff member's own school.

type Staff = { id: string; roles: Role[]; schoolId: string | null; name: string | null; email?: string };
const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

function schoolOf(staff: Staff): string {
  if (!staff.roles.includes("staff") || !staff.schoolId) throw new UserError("Staff only.");
  return staff.schoolId;
}

async function schoolName(schoolId: string) {
  return (await db.school.findUnique({ where: { id: schoolId } }))?.name ?? "your school";
}

// ─── Tutor approvals ────────────────────────────────────────────────────────

export async function approvalsQueue(staff: Staff) {
  const schoolId = schoolOf(staff);
  const rows = await db.tutorSubject.findMany({
    where: { tutor: { schoolId } },
    include: { subject: true, endorser: { select: { name: true } }, tutor: { include: { consent: true } } },
    orderBy: [{ createdAt: "asc" }],
  });
  const order = { pending: 0, approved: 1, revoked: 2 } as const;
  return rows
    .sort((a, b) => order[a.status] - order[b.status])
    .map((r) => ({
      id: r.id,
      student: `${displayName(r.tutor.name)} · ${gradeLabel(r.tutor.grade)}`,
      subject: r.subject.name,
      courseGrade: r.courseGrade ?? "—",
      endorser: r.endorser?.name ?? r.endorserEmail ?? null,
      // "For me": requests that named this teacher (linked account or the email the student typed).
      forMe: r.endorserId === staff.id || (!!staff.email && r.endorserEmail?.toLowerCase() === staff.email.toLowerCase()),
      tutorId: r.tutorId,
      consentGiven: r.tutor.consent?.status === "approved",
      status: r.status,
    }));
}

async function ownTutorSubject(staff: Staff, id: string) {
  const schoolId = schoolOf(staff);
  const ts = await db.tutorSubject.findFirst({
    where: { id, tutor: { schoolId } },
    include: { subject: true, tutor: { include: { consent: true } } },
  });
  if (!ts) throw new UserError("That approval request isn't at your school.");
  return ts;
}

/** Approve one tutor subject. Blocked until the tutor's parent has consented. */
export async function approveTutorSubject(staff: Staff, id: string) {
  const ts = await ownTutorSubject(staff, id);
  if (ts.tutor.consent?.status !== "approved") throw new UserError("You can approve once a parent has consented.");
  if (ts.status === "approved") return { toast: "Already approved" };
  await db.tutorSubject.update({ where: { id }, data: { status: "approved", decidedAt: new Date(), decidedById: staff.id } });
  await sendEmailSafely(
    subjectDecisionEmail({ to: ts.tutor.email, subject: ts.subject.name, approved: true, staffName: staff.name ?? "A teacher", url: `${appUrl()}/dashboard` }),
  );
  return { toast: `${displayName(ts.tutor.name)} approved for ${ts.subject.name}` };
}

/** Revoke approval at any time; the tutor stops appearing for that subject. */
export async function revokeTutorSubject(staff: Staff, id: string) {
  const ts = await ownTutorSubject(staff, id);
  if (ts.status !== "approved") throw new UserError("Only approved subjects can be revoked.");
  await db.tutorSubject.update({ where: { id }, data: { status: "revoked", decidedAt: new Date(), decidedById: staff.id } });
  await sendEmailSafely(
    subjectDecisionEmail({ to: ts.tutor.email, subject: ts.subject.name, approved: false, staffName: staff.name ?? "A teacher", url: `${appUrl()}/dashboard` }),
  );
  return { toast: "Approval revoked" };
}

// ─── Service hours ──────────────────────────────────────────────────────────

const DECIDED_WINDOW_MS = 14 * 86400000;

/** Logged hours waiting for sign-off, plus the last two weeks of decisions. */
export async function hoursQueue(staff: Staff) {
  const schoolId = schoolOf(staff);
  const logs = await db.hourLog.findMany({
    where: {
      tutor: { schoolId },
      OR: [{ status: "logged" }, { reviewedAt: { gte: new Date(Date.now() - DECIDED_WINDOW_MS) } }],
    },
    include: {
      tutor: { select: { name: true } },
      session: { include: { subject: true, learner: { select: { name: true } } } },
    },
    orderBy: [{ loggedAt: "asc" }],
  });
  const rows = logs
    .sort((a, b) => Number(b.status === "logged") - Number(a.status === "logged"))
    .map((l) => ({
      id: l.id,
      tutor: displayName(l.tutor.name),
      learner: displayName(l.session.learner.name),
      subject: l.session.subject.name,
      session: `${shortDay(l.session.startsAt)} · ${l.session.durationMin} min`,
      hours: Number(l.hours),
      learnerConfirmed: !!l.session.learnerConfirmedAt,
      status: l.status,
    }));
  const waiting = rows.filter((r) => r.status === "logged");
  return {
    rows,
    waitingCount: waiting.length,
    waitingHours: Math.round(waiting.reduce((a, r) => a + r.hours, 0) * 100) / 100,
    confirmedCount: waiting.filter((r) => r.learnerConfirmed).length,
  };
}

async function decideHours(staff: Staff, ids: string[], decision: "approved" | "rejected", requireConfirmed: boolean) {
  const schoolId = schoolOf(staff);
  const logs = await db.hourLog.findMany({
    where: {
      id: { in: ids },
      status: "logged",
      tutor: { schoolId },
      ...(requireConfirmed ? { session: { learnerConfirmedAt: { not: null } } } : {}),
    },
    include: { tutor: true, session: { include: { subject: true, learner: { include: { school: { include: { slots: true } } } } } } },
  });
  // Flip each row only if it's still "logged", so a tutor un-logging at the same moment wins cleanly.
  const now = new Date();
  const decided: typeof logs = [];
  for (const l of logs) {
    const { count } = await db.hourLog.updateMany({
      where: { id: l.id, status: "logged" },
      data: { status: decision, reviewedById: staff.id, reviewedAt: now },
    });
    if (count === 1) decided.push(l);
  }
  for (const l of decided) {
    const labels = new Map((l.session.learner.school?.slots ?? []).map((s) => [s.startMinute, s.label]));
    await sendEmailSafely(
      hoursDecisionEmail({
        to: l.tutor.email,
        hours: Number(l.hours),
        subject: l.session.subject.name,
        when: sessionWhen(l.session.startsAt, labels),
        approved: decision === "approved",
        url: `${appUrl()}/dashboard`,
      }),
    );
  }
  return decided;
}

export async function approveHours(staff: Staff, id: string) {
  const [log] = await decideHours(staff, [id], "approved", false);
  if (!log) throw new UserError("Those hours were already decided or aren't at your school.");
  return { toast: `${Number(log.hours)}h approved for ${displayName(log.tutor.name)}` };
}

export async function rejectHours(staff: Staff, id: string) {
  const [log] = await decideHours(staff, [id], "rejected", false);
  if (!log) throw new UserError("Those hours were already decided or aren't at your school.");
  return { toast: `Hours rejected. ${displayName(log.tutor.name)} has been notified.` };
}

/** "Approve all confirmed": only rows whose learner confirmed the session (BACKEND.md › Hours). */
export async function approveAllConfirmed(staff: Staff) {
  const schoolId = schoolOf(staff);
  const ids = (
    await db.hourLog.findMany({
      where: { status: "logged", tutor: { schoolId }, session: { learnerConfirmedAt: { not: null } } },
      select: { id: true },
    })
  ).map((l) => l.id);
  const done = await decideHours(staff, ids, "approved", true);
  return { toast: `${done.length} entr${done.length === 1 ? "y" : "ies"} approved` };
}

// ─── Reports ────────────────────────────────────────────────────────────────

/** Reports involving someone at the staff member's school: newest unresolved first. */
export async function reportsQueue(staff: Staff) {
  const schoolId = schoolOf(staff);
  const reports = await db.report.findMany({
    where: { OR: [{ againstUser: { schoolId } }, { reporter: { schoolId } }] },
    include: {
      reporter: { select: { name: true, roles: true } },
      againstUser: { select: { id: true, name: true, roles: true, tutorStatus: true } },
      message: true,
      session: { include: { subject: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Promise.all(
    reports
      .sort((a, b) => Number(b.status === "new") - Number(a.status === "new"))
      .map(async (r) => {
        // Chat excerpt: the flagged message with a little context, or the latest messages.
        let excerpt: { id: string; sender: string; body: string; flagged: boolean }[] = [];
        if (r.threadId) {
          const around = r.message
            ? await db.message.findMany({
                where: { threadId: r.threadId, createdAt: { lte: r.message.createdAt } },
                orderBy: { createdAt: "desc" },
                take: 3,
                include: { sender: { select: { name: true } } },
              })
            : await db.message.findMany({
                where: { threadId: r.threadId },
                orderBy: { createdAt: "desc" },
                take: 3,
                include: { sender: { select: { name: true } } },
              });
          excerpt = around.reverse().map((m) => ({
            id: m.id,
            sender: displayName(m.sender.name).split(" ")[0]!,
            body: m.body,
            flagged: m.id === r.messageId || m.flagged,
          }));
        }
        const role = (roles: Role[] | undefined) => (roles?.includes("tutor") ? "tutor" : roles?.includes("learner") ? "learner" : "user");
        return {
          id: r.id,
          number: r.number,
          title: r.reason.split(":")[0]!.replace(/^Possible /, "").replace(/ \(auto-flagged.*$/, ""),
          reason: r.reason,
          status: r.status,
          actions: r.actions,
          automatic: r.automatic,
          filedBy: r.automatic && !r.reporter ? "TierUp's automatic filter" : `${role(r.reporter?.roles)} ${displayName(r.reporter?.name)}`,
          against: r.againstUser ? displayName(r.againstUser.name) : null,
          againstIsTutor: !!r.againstUser?.roles.includes("tutor"),
          againstPaused: !!r.againstUser?.tutorStatus?.paused,
          createdAt: r.createdAt,
          threadId: r.threadId,
          sessionLabel: r.session ? `${r.session.subject.name} · ${shortDay(r.session.startsAt)}` : null,
          excerpt,
        };
      }),
  );
}

async function ownReport(staff: Staff, id: string) {
  const schoolId = schoolOf(staff);
  const report = await db.report.findFirst({
    where: { id, OR: [{ againstUser: { schoolId } }, { reporter: { schoolId } }] },
    include: {
      againstUser: { include: { consent: true, tutorStatus: true } },
      reporter: { include: { consent: true } },
    },
  });
  if (!report) throw new UserError("That report isn't at your school.");
  return { report, schoolId };
}

const addAction = (actions: string[], a: string) => (actions.includes(a) ? actions : [...actions, a]);

export async function dismissReport(staff: Staff, id: string) {
  const { report } = await ownReport(staff, id);
  await db.report.update({ where: { id }, data: { status: "dismissed", handledById: staff.id, actions: addAction(report.actions, "dismissed") } });
  return { toast: "Report dismissed" };
}

/** Emails the reported person a warning. */
export async function warnReported(staff: Staff, id: string) {
  const { report, schoolId } = await ownReport(staff, id);
  const who = report.againstUser;
  if (!who) throw new UserError("This report isn't about a person.");
  await db.report.update({ where: { id }, data: { status: "warned", handledById: staff.id, actions: addAction(report.actions, "warned") } });
  await sendEmailSafely(warningEmail({ to: who.email, name: displayName(who.name), reason: report.reason, schoolName: await schoolName(schoolId) }));
  return { toast: `Warning sent to ${displayName(who.name)}` };
}

/**
 * Pauses the reported tutor: hidden everywhere (discoverability checks the pause) and all future
 * sessions are cancelled, with their Meets removed and everyone notified (BACKEND.md › Moderation).
 */
export async function pauseReportedTutor(staff: Staff, id: string) {
  const { report, schoolId } = await ownReport(staff, id);
  const tutor = report.againstUser;
  if (!tutor?.roles.includes("tutor")) throw new UserError("Only tutors can be paused.");
  if (tutor.schoolId !== schoolId) throw new UserError("You can only pause tutors at your school.");

  const now = new Date();
  const future = await db.tutoringSession.findMany({
    where: { tutorId: tutor.id, status: "confirmed", startsAt: { gt: now } },
    include: { subject: true, learner: { include: { consent: true, school: { include: { slots: true } } } } },
  });
  await db.$transaction([
    db.tutorStatus.upsert({ where: { tutorId: tutor.id }, create: { tutorId: tutor.id, paused: true }, update: { paused: true } }),
    db.tutoringSession.updateMany({
      where: { id: { in: future.map((s) => s.id) }, status: "confirmed" },
      data: { status: "cancelled", cancelledAt: now, cancelledById: staff.id, cancelReason: "Tutor paused by school staff" },
    }),
    db.report.update({ where: { id }, data: { status: "paused", handledById: staff.id, actions: addAction(report.actions, "paused") } }),
  ]);

  const provider = await getMeetProvider();
  for (const s of future) {
    if (s.calendarEventId || s.meetSpaceName) {
      await provider.cancelMeeting({ calendarEventId: s.calendarEventId, spaceName: s.meetSpaceName }).catch((err) => console.error(err));
    }
    const when = sessionWhen(s.startsAt, new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label])));
    const email = (to: string) =>
      sessionCancelledEmail({ to, byName: "School staff", subject: s.subject.name, when, reason: "The tutor is unavailable", url: `${appUrl()}/find` });
    await sendEmailSafely(email(s.learner.email));
    if (s.learner.consent) await sendEmailSafely(email(s.learner.consent.parentEmail));
  }
  await sendEmailSafely(pausedEmail({ to: tutor.email, name: displayName(tutor.name), schoolName: await schoolName(schoolId), cancelled: future.length }));
  return { toast: `${displayName(tutor.name)} is paused from tutoring${future.length ? `; ${future.length} session${future.length === 1 ? "" : "s"} cancelled` : ""}` };
}

/** Lifts a pause (the report keeps its history). */
export async function unpauseTutor(staff: Staff, id: string) {
  const { report, schoolId } = await ownReport(staff, id);
  const tutor = report.againstUser;
  if (!tutor || tutor.schoolId !== schoolId) throw new UserError("You can only unpause tutors at your school.");
  await db.tutorStatus.update({ where: { tutorId: tutor.id }, data: { paused: false } });
  await db.report.update({ where: { id }, data: { actions: addAction(report.actions, "unpaused") } });
  return { toast: `${displayName(tutor.name)} can tutor again` };
}

/** Emails both families (the reporter's and the reported student's parents). */
export async function notifyParents(staff: Staff, id: string) {
  const { report, schoolId } = await ownReport(staff, id);
  const name = await schoolName(schoolId);
  const sent: string[] = [];
  for (const student of [report.reporter, report.againstUser]) {
    if (!student?.consent) continue;
    await sendEmailSafely(reportParentEmail({ to: student.consent.parentEmail, studentName: displayName(student.name), schoolName: name, summary: report.reason }));
    sent.push(student.consent.parentEmail);
  }
  if (sent.length === 0) throw new UserError("No parent contacts on file for this report.");
  await db.report.update({ where: { id }, data: { handledById: staff.id, actions: addAction(report.actions, "notified_parents") } });
  return { toast: sent.length === 2 ? "Both families notified" : "Family notified" };
}

// ─── Session log ────────────────────────────────────────────────────────────

const STATUS_LABEL = { requested: "Requested", confirmed: "Confirmed", completed: "Done", no_show: "No-show", cancelled: "Cancelled" } as const;

/** Every booked session involving the school (pre-booking chats excluded), newest first. */
export async function sessionLog(staff: Staff, limit = 100) {
  const schoolId = schoolOf(staff);
  const sessions = await db.tutoringSession.findMany({
    where: { OR: [{ tutor: { schoolId } }, { learner: { schoolId } }] },
    include: {
      tutor: { select: { id: true, name: true } },
      learner: { select: { id: true, name: true, school: { include: { slots: true } } } },
      subject: true,
      attendance: true,
    },
    orderBy: { startsAt: "desc" },
    take: limit,
  });
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return sessions.map((s) => ({
    id: s.id,
    threadId: s.threadId,
    when: sessionWhen(s.startsAt, new Map((s.learner.school?.slots ?? []).map((sl) => [sl.startMinute, sl.label]))),
    tutor: displayName(s.tutor.name),
    learner: displayName(s.learner.name),
    subject: s.subject.name,
    format: s.format === "online" ? "Online" : "In person",
    location: s.location,
    meetUrl: s.meetUrl,
    status: STATUS_LABEL[s.status],
    attendance: s.attendance.map((a) => ({
      who: a.userId === s.tutor.id ? displayName(s.tutor.name) : displayName(s.learner.name),
      text: `${fmt(a.joinedAt)}–${a.leftAt ? fmt(a.leftAt) : "?"}`,
    })),
  }));
}
