import { AuthorizationError } from "./permissions";
import { ZodError } from "zod";

/**
 * Typed result contract for every server action (§8): `{ ok, error? }`.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/**
 * Wrap a server action body so authorization and validation errors become
 * clean `{ ok:false, error }` results instead of thrown 500s.
 */
export async function runAction<T>(
  fn: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ZodError) {
      const first = err.errors[0];
      return { ok: false, error: first?.message ?? "Invalid input." };
    }
    console.error("[action] unexpected error:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
