// Who counts as an admin. PURE TS (no next/* imports, no side effects) so both
// the Next routes/pages (via lib/routeAuth) and framework-free modules such as
// lib/email.ts can share the one list. Defaults to the founder's account;
// override with a comma-separated ADMIN_EMAILS env var.
export const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS ?? "vivestarter@gmail.com")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
