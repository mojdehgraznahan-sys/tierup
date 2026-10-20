import { redirect } from "next/navigation";
import { isAdminEmail } from "@/server/policies/admin";
import { homePathFor, requireUser } from "@/server/policies/session";

/** Post-login router: TierUp admins without a student/staff account go to /admin; others onboard or go home. */
export default async function StartPage() {
  const user = await requireUser();
  if (!user.onboardedAt && isAdminEmail(user.email)) redirect("/admin");
  redirect(homePathFor(user));
}
