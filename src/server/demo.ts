/** Demo schools show up outside production, or anywhere ALLOW_DEMO_SCHOOLS=true (previews, e2e). */
export function demoSchoolsEnabled(): boolean {
  return process.env.ALLOW_DEMO_SCHOOLS === "true" || process.env.NODE_ENV !== "production";
}
