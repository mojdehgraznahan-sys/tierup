import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { EmailConfig } from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { magicLinkEmail } from "@/server/email/templates";
import { consume, SIGNIN_LIMITS } from "@/server/rate-limit";

// Sign-in link by email, sent through our own mailer (Resend, or the console in dev).
const emailLink: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  maxAge: 24 * 60 * 60,
  async sendVerificationRequest({ identifier, url }) {
    await sendEmail(magicLinkEmail(identifier, url));
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  trustHost: true,
  pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
  providers: [
    // Google verifies the address, so linking it to an existing email-link account is safe.
    Google({ allowDangerousEmailAccountLinking: true }),
    emailLink,
  ],
  callbacks: {
    // Runs before Auth.js creates or emails a sign-in link, so this limit also covers direct API calls.
    // Returning a URL makes Auth.js redirect there instead of sending.
    async signIn({ user, email }) {
      if (email?.verificationRequest && user.email) {
        const { limit, windowMs } = SIGNIN_LIMITS.perEmail;
        const r = await consume(`signin-email:${user.email.toLowerCase()}`, limit, windowMs);
        if (!r.ok) return "/login?error=rate_limited";
      }
      return true;
    },
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
