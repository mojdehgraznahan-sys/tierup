import { redirect } from "next/navigation";
import { homePathFor, requireUser } from "@/server/policies/session";

/** Post-login router: onboarding for new accounts, otherwise the user's home. */
export default async function StartPage() {
  const user = await requireUser();
  redirect(homePathFor(user));
}
