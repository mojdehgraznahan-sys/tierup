import { NextResponse, type NextRequest } from "next/server";
import { UserError } from "@/server/errors";
import { getCurrentUser } from "@/server/policies/session";
import { messagesSince } from "@/server/services/messaging";

/** Polling endpoint for the chat: messages newer than ?after=<ISO time>. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.onboardedAt) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const afterRaw = req.nextUrl.searchParams.get("after");
  const after = afterRaw ? new Date(afterRaw) : new Date(0);
  if (Number.isNaN(after.getTime())) return NextResponse.json({ error: "Bad 'after' time" }, { status: 400 });

  try {
    const messages = await messagesSince(user, id, after);
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}
