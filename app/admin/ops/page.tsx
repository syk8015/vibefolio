import { redirect } from "next/navigation";

// The ops console merged into the unified /admin control tower (2026-07-17).
// Kept as a redirect so old bookmarks and alert-email CTAs don't break.
export default function AdminOpsRedirect() {
  redirect("/admin");
}
