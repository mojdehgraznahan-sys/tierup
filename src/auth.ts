import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { EmailConfig } from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { magicLinkEmail } from "@/server/email/templates";

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
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
