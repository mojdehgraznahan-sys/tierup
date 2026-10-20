import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { FREQUENT, JOBS, type JobName } from "@/server/jobs";

export const dynamic = "force-dynamic";

/** Constant-time check of "Authorization: Bearer <CRON_SECRET>" (Vercel Cron sends this). */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** GET /api/cron/<job> runs one job; /api/cron/all runs every frequent job. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { job } = await params;
  const names: JobName[] = job === "all" ? FREQUENT : job in JOBS ? [job as JobName] : [];
  if (names.length === 0) return NextResponse.json({ error: `Unknown job ${job}` }, { status: 404 });

  const results: Record<string, unknown> = {};
  for (const name of names) {
    try {
      results[name] = await JOBS[name]();
    } catch (err) {
      console.error(`Job ${name} failed`, err);
      results[name] = { error: true };
    }
  }
  return NextResponse.json({ ok: true, results });
}
