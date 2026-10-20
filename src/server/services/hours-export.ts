import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { zonedDate } from "@/lib/time";
import type { hoursExport } from "./hours";

type Data = Awaited<ReturnType<typeof hoursExport>>;

const STATUS = { logged: "Waiting for sign-off", approved: "Approved", rejected: "Rejected" } as const;

/** RFC 4180 CSV. Cells starting with = + - @ are prefixed so spreadsheets don't run them as formulas. */
export function hoursCsv(data: Data): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Date", "Subject", "Learner", "Hours", "Status", "Learner confirmed", "Signed off by", "Signed off on"];
  const lines = data.rows.map((r) =>
    [r.date, r.subject, r.learner, r.hours, STATUS[r.status], r.learnerConfirmed ? "Yes" : "No", r.reviewedBy, r.reviewedAt].map(cell).join(","),
  );
  return [header.join(","), ...lines, "", `Approved total,,,${data.approvedTotal}`].join("\r\n") + "\r\n";
}

/** A one-or-more page PDF log a school can file. */
export async function hoursPdf(data: Data): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.23, 0.14, 0.08);
  const muted = rgb(0.39, 0.33, 0.29);
  const pink = rgb(0.85, 0.33, 0.67);
  // Standard fonts are WinAnsi only; replace anything they can't draw.
  const safe = (s: string) => s.replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

  const cols = [
    { title: "Date", x: 50 },
    { title: "Subject", x: 120 },
    { title: "Learner", x: 260 },
    { title: "Hours", x: 345 },
    { title: "Status", x: 390 },
    { title: "Signed off by", x: 490 },
  ];
  let page = pdf.addPage([612, 792]);
  let y = 742;

  const header = () => {
    page.drawText("TierUp", { x: 50, y, size: 18, font: bold, color: ink });
    page.drawText("Team Up, TierUp", { x: 118, y: y + 1, size: 9, font, color: pink });
    y -= 30;
    page.drawText(safe(`Service-hour log - ${data.tutorName}`), { x: 50, y, size: 14, font: bold, color: ink });
    y -= 18;
    page.drawText(safe(`${data.schoolName} · School year ${data.yearLabel} · Goal ${data.goal} h`), { x: 50, y, size: 10, font, color: muted });
    y -= 28;
    for (const c of cols) page.drawText(c.title.toUpperCase(), { x: c.x, y, size: 8, font: bold, color: muted });
    y -= 6;
    page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: muted });
    y -= 14;
  };
  header();

  for (const r of data.rows) {
    if (y < 80) {
      page = pdf.addPage([612, 792]);
      y = 742;
      header();
    }
    const values = [r.date, r.subject, r.learner, r.hours.toFixed(2), STATUS[r.status], r.reviewedBy];
    values.forEach((v, i) => page.drawText(safe(v).slice(0, i === 1 ? 26 : 22), { x: cols[i]!.x, y, size: 9, font, color: ink }));
    y -= 16;
  }

  y -= 10;
  page.drawLine({ start: { x: 50, y: y + 6 }, end: { x: 562, y: y + 6 }, thickness: 0.5, color: muted });
  page.drawText(`Approved total: ${data.approvedTotal} h`, { x: 50, y: y - 10, size: 11, font: bold, color: ink });
  const today = zonedDate(new Date());
  const generated = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  page.drawText(safe(`Generated ${generated}. Hours count once a teacher signs off.`), {
    x: 50,
    y: y - 28,
    size: 8,
    font,
    color: muted,
  });
  return pdf.save();
}
