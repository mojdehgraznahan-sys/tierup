import "server-only";
import type { Email } from "./send";

// Plain HTML emails in the TierUp palette. Every template returns both html and text.

const INK = "#3B2314";
const GOLD = "#DDA15E";
const PINK = "#D954AA";
const BG = "#FDFBF7";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function layout(opts: { kicker: string; title: string; paragraphs: string[]; cta?: { label: string; url: string }; footer?: string }) {
  const body = opts.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${esc(p)}</p>`).join("");
  const cta = opts.cta
    ? `<p style="margin:22px 0"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:${GOLD};color:${BG};text-decoration:none;font-weight:700;padding:11px 18px;border:1px solid ${GOLD}">${esc(opts.cta.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#827064">Or paste this link into your browser:<br>${esc(opts.cta.url)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:${BG};color:${INK};font-family:Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="font-weight:800;font-size:20px;margin-bottom:28px">TierUp <span style="font-weight:500;font-size:12px;color:${PINK}">Team Up, TierUp</span></div>
<div style="border:1px solid rgba(59,35,20,.18);padding:24px">
<div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${PINK};margin-bottom:8px">${esc(opts.kicker)}</div>
<h1 style="font-size:24px;line-height:1.2;margin:0 0 16px">${esc(opts.title)}</h1>
${body}${cta}
</div>
<p style="font-size:12px;color:#827064;margin-top:18px">${esc(opts.footer ?? "You're receiving this because someone entered your email on TierUp, a peer-tutoring platform for DMV high schools.")}</p>
</div></body></html>`;
}

function text(opts: { title: string; paragraphs: string[]; cta?: { label: string; url: string } }) {
  return [opts.title, "", ...opts.paragraphs, ...(opts.cta ? ["", `${opts.cta.label}: ${opts.cta.url}`] : [])].join("\n");
}

function build(to: string, subject: string, opts: Parameters<typeof layout>[0]): Email {
  return { to, subject, html: layout(opts), text: text(opts) };
}

export function magicLinkEmail(to: string, url: string): Email {
  return build(to, "Your TierUp sign-in link", {
    kicker: "Sign in",
    title: "Here's your sign-in link",
    paragraphs: ["Click the button to sign in to TierUp. The link works once and expires in 24 hours."],
    cta: { label: "Sign in to TierUp", url },
    footer: "If you didn't ask for this, you can ignore this email.",
  });
}

export function parentConsentEmail(opts: {
  to: string;
  studentName: string;
  schoolName: string | null;
  role: "learner" | "tutor";
  url: string;
}): Email {
  const what =
    opts.role === "tutor"
      ? `${opts.studentName} wants to tutor other students on TierUp and earn service hours.`
      : `${opts.studentName} wants to get help from student tutors on TierUp.`;
  return build(opts.to, `${opts.studentName} needs your consent to use TierUp`, {
    kicker: "Parent consent",
    title: `Approve ${opts.studentName} for TierUp`,
    paragraphs: [
      what,
      `TierUp connects high-school students${opts.schoolName ? ` at ${opts.schoolName}` : ""} for peer tutoring. Tutors are approved by their teachers, sessions happen in approved school spaces or on a private one-time Google Meet, and school staff can see every chat.`,
      "Your child can browse now, but can't book or tutor until you approve.",
    ],
    cta: { label: "Review and respond", url: opts.url },
  });
}

export function teacherEndorsementEmail(opts: {
  to: string;
  tutorName: string;
  schoolName: string | null;
  subjects: string[];
  url: string;
}): Email {
  const list = opts.subjects.join(", ");
  return build(opts.to, `${opts.tutorName} asked you to approve them as a tutor`, {
    kicker: "Tutor approval",
    title: `${opts.tutorName} wants to tutor ${list}`,
    paragraphs: [
      `${opts.tutorName}${opts.schoolName ? ` (${opts.schoolName})` : ""} named you as the teacher who can vouch for them in: ${list}.`,
      "Sign in with your school email to review the request. You can approve each subject separately and revoke approval at any time. Tutors earn service hours that you sign off on.",
    ],
    cta: { label: "Review the request", url: opts.url },
  });
}

export function newRequestEmail(opts: { to: string; subject: string; learnerLabel: string; description: string; url: string }): Email {
  return build(opts.to, `New ${opts.subject} request on TierUp`, {
    kicker: "New request",
    title: `A ${opts.learnerLabel} needs help with ${opts.subject}`,
    paragraphs: [`"${opts.description}"`, "Reply on TierUp if you can help. Requests expire after 48 hours."],
    cta: { label: "See the request", url: opts.url },
    footer: "You're receiving this because a teacher approved you to tutor this subject on TierUp.",
  });
}

export function requestResponseEmail(opts: { to: string; tutorName: string; subject: string; message: string; url: string }): Email {
  return build(opts.to, `${opts.tutorName} replied to your ${opts.subject} request`, {
    kicker: "New reply",
    title: `${opts.tutorName} can help with ${opts.subject}`,
    paragraphs: [`"${opts.message}"`, "Book a time, message them first, or look at their profile."],
    cta: { label: "See replies", url: opts.url },
  });
}

export function bookingEmail(opts: { to: string; otherName: string; subject: string; when: string; where: string; meetUrl: string | null; url: string }): Email {
  return build(opts.to, `Booked: ${opts.subject} with ${opts.otherName}, ${opts.when}`, {
    kicker: "Booked",
    title: `You're set with ${opts.otherName}`,
    paragraphs: [
      `${opts.subject} · ${opts.when} · 45 min · ${opts.where}`,
      ...(opts.meetUrl
        ? [`Your one-time Google Meet: ${opts.meetUrl}`, "It opens 10 minutes before the start, only works for this session, and expires when it ends."]
        : ["Meet in person at the spot above. Check in on the app when you arrive."]),
    ],
    cta: { label: "Go to session", url: opts.url },
  });
}

export function parentBookingEmail(opts: { to: string; studentName: string; tutorName: string; subject: string; when: string; where: string }): Email {
  return build(opts.to, `${opts.studentName} booked a ${opts.subject} session`, {
    kicker: "Booking",
    title: `${opts.studentName} booked a tutoring session`,
    paragraphs: [
      `${opts.subject} with ${opts.tutorName}, a teacher-approved student tutor.`,
      `${opts.when} · 45 min · ${opts.where}`,
      "Online sessions use a private, one-time Google Meet. In-person sessions happen only in approved school spaces.",
    ],
  });
}

export function sessionConfirmedEmail(opts: { to: string; learnerName: string; subject: string; when: string; hours: string; url: string }): Email {
  return build(opts.to, `${opts.learnerName} confirmed your ${opts.subject} session`, {
    kicker: "Session done",
    title: "Nice work! Log your service hours",
    paragraphs: [
      `${opts.learnerName} confirmed your ${opts.subject} session on ${opts.when}.`,
      `Check it off on your dashboard to send ${opts.hours} h to your teacher for sign-off.`,
    ],
    cta: { label: "Log my hours", url: opts.url },
    footer: "You're receiving this because you tutor on TierUp.",
  });
}

export function sessionSummaryEmail(opts: { to: string; studentName: string; tutorName: string; subject: string; when: string; happened: string; notes: string | null }): Email {
  return build(opts.to, `Session summary: ${opts.studentName}'s ${opts.subject} session`, {
    kicker: "Session summary",
    title: `${opts.studentName}'s ${opts.subject} session`,
    paragraphs: [
      `${opts.when} with ${opts.tutorName}. ${opts.happened}`,
      ...(opts.notes ? [`Tutor's notes: "${opts.notes}"`] : []),
      "You get these summaries because you opted in when you gave consent.",
    ],
  });
}

export function sessionCancelledEmail(opts: { to: string; byName: string; subject: string; when: string; reason: string | null; url: string }): Email {
  return build(opts.to, `Cancelled: ${opts.subject}, ${opts.when}`, {
    kicker: "Cancelled",
    title: `${opts.byName} cancelled ${opts.subject}`,
    paragraphs: [
      `The session on ${opts.when} is cancelled.${opts.reason ? ` Reason: "${opts.reason}"` : ""}`,
      "Any Google Meet link for it no longer works. You can book a new time on TierUp.",
    ],
    cta: { label: "Open TierUp", url: opts.url },
  });
}

export function subjectDecisionEmail(opts: { to: string; subject: string; approved: boolean; staffName: string; url: string }): Email {
  return build(opts.to, opts.approved ? `You're approved to tutor ${opts.subject}` : `Your ${opts.subject} tutoring approval was revoked`, {
    kicker: "Tutor approval",
    title: opts.approved ? `You can tutor ${opts.subject}` : `${opts.subject} approval revoked`,
    paragraphs: opts.approved
      ? [`${opts.staffName} approved you for ${opts.subject}. Learners can now find you, and you'll see ${opts.subject} requests on your dashboard.`]
      : [`${opts.staffName} revoked your approval for ${opts.subject}. Learners won't see you for it anymore. Ask them if you have questions.`],
    cta: { label: "Open dashboard", url: opts.url },
    footer: "You're receiving this because you tutor on TierUp.",
  });
}

export function hoursDecisionEmail(opts: { to: string; hours: number; subject: string; when: string; approved: boolean; url: string }): Email {
  return build(opts.to, opts.approved ? `${opts.hours}h approved` : `Hours not approved: ${opts.subject}, ${opts.when}`, {
    kicker: "Service hours",
    title: opts.approved ? `${opts.hours}h added to your total` : "Your teacher didn't approve these hours",
    paragraphs: [
      `${opts.subject} · ${opts.when}`,
      opts.approved ? "They now count toward your service-hour goal." : "Ask your teacher about it if you think this is a mistake.",
    ],
    cta: { label: "See my hours", url: opts.url },
    footer: "You're receiving this because you tutor on TierUp.",
  });
}

export function warningEmail(opts: { to: string; name: string; reason: string; schoolName: string }): Email {
  return build(opts.to, "A warning from your school about TierUp", {
    kicker: "Warning",
    title: `${opts.name}, please review TierUp's rules`,
    paragraphs: [
      `Staff at ${opts.schoolName} reviewed a report about your activity on TierUp: ${opts.reason}.`,
      "Keep all contact on TierUp, meet only in approved spaces or on the one-time Meet, and be respectful. Further reports can pause your account.",
    ],
  });
}

export function pausedEmail(opts: { to: string; name: string; schoolName: string; cancelled: number }): Email {
  return build(opts.to, "Your TierUp tutoring is paused", {
    kicker: "Paused",
    title: `${opts.name}, your tutoring is paused`,
    paragraphs: [
      `Staff at ${opts.schoolName} paused your tutoring after a report. Learners can't find or book you while it's paused.`,
      opts.cancelled ? `${opts.cancelled} upcoming session${opts.cancelled === 1 ? " was" : "s were"} cancelled and the learners were told.` : "",
      "Talk to your school's staff about next steps.",
    ].filter(Boolean),
  });
}

export function reportParentEmail(opts: { to: string; studentName: string; schoolName: string; summary: string }): Email {
  return build(opts.to, `${opts.schoolName} would like you to know about a TierUp report`, {
    kicker: "Safety notice",
    title: `About ${opts.studentName}'s use of TierUp`,
    paragraphs: [
      `School staff at ${opts.schoolName} are reviewing a report involving ${opts.studentName}: ${opts.summary}.`,
      "No action is needed from you right now. Staff may follow up; you can also contact the school directly.",
    ],
  });
}
