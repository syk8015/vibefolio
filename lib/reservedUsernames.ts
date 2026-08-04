// Usernames live at the root path (/{username}), so a name that collides with a
// real route becomes an unreachable card, and trust-sensitive labels (admin, www,
// official …) invite impersonation. Mirrored by the DB check constraint
// profiles_username_not_reserved in supabase/migration_prelaunch_hardening.sql —
// keep the two lists in sync (the DB is the backstop; this list gives the
// friendly error before a write is attempted).
export const RESERVED_USERNAMES = new Set([
  // app routes (app/*)
  "admin", "api", "auth", "dashboard", "login", "signup", "onboarding",
  "publish", "privacy", "terms", "forgot-password", "reset-password",
  "error", "not-found",
  // framework / static surfaces
  "_next", "static", "public", "assets", "favicon", "robots", "sitemap",
  "icon", "apple-icon",
  // future or likely routes + high-trust labels
  "explore", "watch", "settings", "account", "help", "support", "docs",
  "blog", "about", "www", "mail", "email", "root", "system", "official",
  "nookframe", "null", "undefined", "me", "new", "edit",
]);

export function isReservedUsername(name: string): boolean {
  return RESERVED_USERNAMES.has(name.toLowerCase());
}
