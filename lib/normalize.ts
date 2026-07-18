/**
 * Single source of truth for email normalization (§15.4). Applied at invite
 * creation, account creation, login, and password reset. The DB unique
 * constraint operates on this normalized form.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Slugify an act name (§14.7). Collision handling (appending -2, -3, …) is done
 * by the caller against the DB.
 */
export function slugifyName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    || "act";
}
