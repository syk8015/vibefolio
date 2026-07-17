import { redirect } from "next/navigation";

// The metrics panel merged into the unified /admin control tower (2026-07-17).
// Kept as a redirect so old bookmarks don't break.
export default function AdminMetricsRedirect() {
  redirect("/admin");
}
