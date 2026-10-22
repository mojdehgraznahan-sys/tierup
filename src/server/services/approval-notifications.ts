import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { sendEmailSafely } from "@/server/email/send";
import { tutorApprovalEmail, type ApprovalEmailKind } from "@/server/email/templates";
import { displayName, gradeLabel } from "@/lib/names";
import { parentConsentEnabled } from "@/server/policies/rules";

// Emails to endorsing teachers about tutor-subject approval requests:
//   request  – when a student asks (onboarding, or adding a subject in Settings)
//   ready    – once the student's parent consents (only if the request went out before consent)
//   reminder – one follow-up, TUTOR_APPROVAL_REMINDER_DAYS after it became ready (0 turns it off)

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const DAY_MS = 86400000;

/** Days to wait before the one reminder; 0 disables reminders. Defaults to 3. */
export function reminderDays(env: Record<string, string | undefined> = process.env): number {
  const raw = env.TUTOR_APPROVAL_REMINDER_DAYS;
  if (raw === undefined || raw.trim() === "") return 3;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

/** Where the email button goes: signs the teacher in (or up), then opens their approvals view. */
export const approvalsLink = (tutorId: string) => `${appUrl()}/approvals?tutor=${encodeURIComponent(tutorId)}`;

type Row = Awaited<ReturnType<typeof loadRows>>[number];

function loadRows(where: Prisma.TutorSubjectWhereInput) {
  return db.tutorSubject.findMany({
    where,
    include: {
      subject: true,
      endorser: { select: { email: true } },
      tutor: { select: { id: true, name: true, grade: true, school: { select: { name: true } }, consent: { select: { status: true, decidedAt: true } } } },
    },
    orderBy: { subject: { name: "asc" } },
  });
}

/** One email per (teacher, tutor), listing that tutor's subjects for that teacher. */
async function sendGrouped(rows: Row[], kind: ApprovalEmailKind) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const to = (r.endorser?.email ?? r.endorserEmail)?.toLowerCase();
    if (!to) continue;
    const key = `${to}|${r.tutorId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const [key, group] of groups) {
    const to = key.split("|")[0]!;
    const t = group[0]!.tutor;
    await sendEmailSafely(
      tutorApprovalEmail({
        kind,
        to,
        tutorName: displayName(t.name),
        tutorGrade: gradeLabel(t.grade) || null,
        schoolName: t.school?.name ?? null,
        subjects: group.map((r) => ({ name: r.subject.name, courseGrade: r.courseGrade })),
        consentGiven: parentConsentEnabled() ? t.consent?.status === "approved" : null,
        url: approvalsLink(t.id),
      }),
    );
  }
  return groups.size;
}

/** First email for new requests. If the parent already consented, it doubles as the "ready" email. */
export async function notifyTeachersOfRequests(tutorSubjectIds: string[], now = new Date()) {
  if (tutorSubjectIds.length === 0) return 0;
  const rows = await loadRows({ id: { in: tutorSubjectIds }, status: "pending" });
  const sent = await sendGrouped(rows, "request");
  if (rows.length) await db.tutorSubject.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { requestSentAt: now } });
  const ready = rows.filter((r) => !parentConsentEnabled() || r.tutor.consent?.status === "approved").map((r) => r.id);
  if (ready.length) await db.tutorSubject.updateMany({ where: { id: { in: ready } }, data: { readyNotifiedAt: now } });
  return sent;
}

export const RESEND_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * The tutor resends a pending request to their endorsing teacher (at most once an hour per request,
 * so a teacher can't be flooded).
 */
export async function resendApprovalRequest(tutorId: string, tutorSubjectId: string, now = new Date()) {
  const [row] = await loadRows({ id: tutorSubjectId, tutorId });
  if (!row) throw new UserError("That request isn't on your list.");
  if (row.status !== "pending") throw new UserError(row.status === "approved" ? "Already approved." : "This request was revoked. Ask again from Settings.");
  if (!row.endorser?.email && !row.endorserEmail) throw new UserError("There's no teacher email on this request. Add the subject again in Settings.");

  const last = row.requestSentAt;
  if (last && now.getTime() - last.getTime() < RESEND_COOLDOWN_MS) {
    const mins = Math.ceil((last.getTime() + RESEND_COOLDOWN_MS - now.getTime()) / 60000);
    throw new UserError(`You can resend in ${mins} min.`);
  }
  // Compare-and-set on the previous send time so double clicks send one email.
  const { count } = await db.tutorSubject.updateMany({ where: { id: row.id, requestSentAt: last }, data: { requestSentAt: now } });
  if (count === 0) throw new UserError("Already sent. Try again later.");

  await sendGrouped([row], "request");
  return { toast: `Sent again to ${row.endorser?.email ?? row.endorserEmail}` };
}

/** After a parent consents: tell teachers their pending requests for this student can be approved now. */
export async function notifyTeachersReady(tutorId: string, now = new Date()) {
  const rows = await loadRows({ tutorId, status: "pending", readyNotifiedAt: null, tutor: { consent: { is: { status: "approved" } } } });
  if (rows.length === 0) return 0;
  // Mark first so a double-click on the consent page can't send twice.
  const { count } = await db.tutorSubject.updateMany({
    where: { id: { in: rows.map((r) => r.id) }, readyNotifiedAt: null },
    data: { readyNotifiedAt: now },
  });
  if (count === 0) return 0;
  return sendGrouped(rows, "ready");
}

/** Background job: one reminder for requests still pending N days after they became approvable. */
export async function sendApprovalReminders(now = new Date()) {
  const days = reminderDays();
  if (days === 0) return { reminded: 0, disabled: true };
  const cutoff = new Date(now.getTime() - days * DAY_MS);
  const due = await loadRows({ status: "pending", reminderSentAt: null, readyNotifiedAt: { lte: cutoff } });
  if (due.length === 0) return { reminded: 0 };
  const claimed = await db.tutorSubject.updateMany({ where: { id: { in: due.map((r) => r.id) }, reminderSentAt: null }, data: { reminderSentAt: now } });
  if (claimed.count === 0) return { reminded: 0 };
  return { reminded: await sendGrouped(due, "reminder") };
}
