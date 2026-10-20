// TierUp admins (people who run the platform, not school staff) are configured by deployment:
// ADMIN_EMAILS="you@tierup.app,ops@tierup.app". Nobody can grant admin from inside the app.

export function adminEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return !!email && adminEmails(env).includes(email.toLowerCase());
}
