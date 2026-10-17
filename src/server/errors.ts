import { ZodError } from "zod";
import { firstIssue } from "@/lib/validation/onboarding";

/** An error whose message is safe and useful to show the user. */
export class UserError extends Error {}

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Runs a server-action body and turns expected failures into `{ ok: false, error }`. */
export async function toActionResult<T extends object>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    if (err instanceof UserError) return { ok: false, error: err.message };
    if (err instanceof ZodError) return { ok: false, error: firstIssue(err) };
    throw err;
  }
}
