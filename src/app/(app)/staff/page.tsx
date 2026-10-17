import type { Metadata } from "next";
import { Card } from "@/components/ui/primitives";
import { db } from "@/server/db";
import { requireOnboarded } from "@/server/policies/session";

export const metadata: Metadata = { title: "Moderation" };

export default async function StaffPage() {
  const user = await requireOnboarded(["staff"]);
  const schoolId = user.schoolId!;
  const [pendingApprovals, pendingHours, openReports] = await Promise.all([
    db.tutorSubject.count({ where: { status: "pending", tutor: { schoolId } } }),
    db.hourLog.count({ where: { status: "logged", tutor: { schoolId } } }),
    db.report.count({ where: { status: "new", OR: [{ againstUser: { schoolId } }, { reporter: { schoolId } }] } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="pt-8">
        <span className="kicker">{user.school?.name}</span>
        <h1 className="mt-1">Moderation</h1>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
        {[
          ["Tutor approvals", pendingApprovals, "waiting"],
          ["Service hours", pendingHours, "to sign off"],
          ["Reports", openReports, "new"],
        ].map(([label, n, suffix]) => (
          <Card key={label} blueprint kicker={label}>
            <span className="h text-4xl">{n}</span>
            <span className="muted text-sm">{suffix}</span>
          </Card>
        ))}
      </div>
      <p className="muted m-0 text-[13px]">The approval, hours, reports and session-log tabs arrive with the moderation phase.</p>
    </div>
  );
}
