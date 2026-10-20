import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/policies/session";
import { hoursExport } from "@/server/services/hours";
import { hoursCsv, hoursPdf } from "@/server/services/hours-export";

/** GET /api/hours/export?format=csv|pdf: the signed-in tutor's service-hour log for this school year. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.onboardedAt || !user.roles.includes("tutor")) return NextResponse.json({ error: "Tutors only" }, { status: 403 });

  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const data = await hoursExport(user.id);
  const base = `tierup-service-hours-${data.yearLabel.replace("–", "-")}`;

  if (format === "csv") {
    return new NextResponse(hoursCsv(data), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const pdf = await hoursPdf(data);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${base}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
