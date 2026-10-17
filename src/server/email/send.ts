import "server-only";
import { Resend } from "resend";

export type Email = { to: string; subject: string; html: string; text: string };

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;
const from = process.env.EMAIL_FROM ?? "TierUp <noreply@tierup.app>";

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise prints the email
 * (including any links) to the server console so local flows still work.
 */
export async function sendEmail(email: Email): Promise<void> {
  if (!resend) {
    console.log(
      [
        "",
        "┌─ 📧 email (console; set RESEND_API_KEY to send for real) ─────────",
        `│ To:      ${email.to}`,
        `│ Subject: ${email.subject}`,
        "│",
        ...email.text.split("\n").map((l) => `│ ${l}`),
        "└───────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }
  const { error } = await resend.emails.send({ from, ...email });
  if (error) throw new Error(`Email to ${email.to} failed: ${error.message}`);
}

/** Sends without failing the caller; used after a DB transaction has committed. */
export async function sendEmailSafely(email: Email): Promise<void> {
  try {
    await sendEmail(email);
  } catch (err) {
    console.error(err);
  }
}
