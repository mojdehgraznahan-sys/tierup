import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import { PublicHeader } from "@/components/app/public-header";
import { Button, Card, Field } from "@/components/ui/primitives";
import { getCurrentUser, homePathFor, safeCallbackPath } from "@/server/policies/session";
import { clientIp, consume, SIGNIN_LIMITS } from "@/server/rate-limit";

export const metadata: Metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That email already has an account. Sign in the way you did before.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  AccessDenied: "Sign-in was cancelled.",
  invalid_email: "Enter a valid email address.",
  rate_limited: "Too many sign-in links were requested. Wait a little while, then try again.",
  EmailSignInError: "We couldn't send a sign-in link. Please try again in a few minutes.",
};

type Props = { searchParams: Promise<{ callbackUrl?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl, error } = await searchParams;
  const next = safeCallbackPath(callbackUrl) ?? "/start";

  const user = await getCurrentUser();
  if (user) redirect(safeCallbackPath(callbackUrl) ?? homePathFor(user));

  async function withGoogle() {
    "use server";
    await signIn("google", { redirectTo: next });
  }

  async function withEmail(formData: FormData) {
    "use server";
    const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
    if (!parsed.success) {
      redirect(`/login?error=invalid_email&callbackUrl=${encodeURIComponent(next)}`);
    }
    // Per-network limit, so one person can't spray sign-in links at many addresses.
    const { limit, windowMs } = SIGNIN_LIMITS.perIp;
    if (!(await consume(`signin-ip:${clientIp(await headers())}`, limit, windowMs)).ok) {
      redirect(`/login?error=rate_limited&callbackUrl=${encodeURIComponent(next)}`);
    }
    let result: string | undefined;
    try {
      // redirect: false so the address bar shows our page, not Auth.js's internal verify-request URL.
      result = await signIn("email", { email: parsed.data, redirectTo: next, redirect: false });
    } catch (err) {
      if (err instanceof AuthError) redirect(`/login?error=${err.type}&callbackUrl=${encodeURIComponent(next)}`);
      throw err;
    }
    // The signIn callback answers with a redirect when the per-email limit is hit.
    if (result?.includes("error=rate_limited")) redirect(`/login?error=rate_limited&callbackUrl=${encodeURIComponent(next)}`);
    redirect("/login/check-email");
  }

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6">
      <PublicHeader />
      <div className="mx-auto flex max-w-[440px] flex-col gap-6 pt-10 sm:pt-16">
        <div className="flex flex-col gap-2">
          <span className="kicker">Team Up, TierUp</span>
          <h1>Log in or sign up</h1>
          <p className="muted m-0">Use your Google account, or we&apos;ll email you a sign-in link.</p>
        </div>

        {error && (
          <p role="alert" className="m-0 border border-accent-2-300 bg-accent-2-100 px-3 py-2 text-sm text-accent-2-800">
            {ERRORS[error] ?? "Something went wrong signing you in. Please try again."}
          </p>
        )}

        <Card blueprint className="gap-5 p-6">
          <form action={withGoogle}>
            <Button type="submit" variant="primary" size="lg" className="w-full">
              Continue with Google
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-neutral-600">
            <span className="h-px flex-1 bg-divider" />
            or
            <span className="h-px flex-1 bg-divider" />
          </div>
          <form action={withEmail} className="flex flex-col gap-3">
            <Field label="Email" htmlFor="email">
              <input id="email" name="email" type="email" required autoComplete="email" className="input" placeholder="you@email.com" />
            </Field>
            <Button type="submit" size="lg">
              Email me a sign-in link
            </Button>
          </form>
        </Card>

        <p className="muted m-0 text-[13px]">
          Teachers: sign in with your school email so we can verify you&apos;re staff.
        </p>
      </div>
    </main>
  );
}
