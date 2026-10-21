/** Demo schools show up outside production, or anywhere ALLOW_DEMO_SCHOOLS=true (previews, e2e). */
export function demoSchoolsEnabled(): boolean {
  return process.env.ALLOW_DEMO_SCHOOLS === "true" || process.env.NODE_ENV !== "production";
}

/**
 * Testing switch: RELAX_STAFF_DOMAINS=true turns off staff email-domain checks, so any email can
 * be an endorsing teacher and any signed-in account can sign up as staff at any school.
 * Never enable in production: the startup check (src/server/env.ts) refuses to run with it on.
 */
export function staffDomainsRelaxed(): boolean {
  return process.env.RELAX_STAFF_DOMAINS === "true";
}
