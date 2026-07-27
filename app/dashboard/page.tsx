import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient, { type DashboardProfile } from "@/components/dashboard/DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Self-heal: an authenticated user can still lack a profiles row — e.g. an email
  // signup from before the onboarding-gate fix, or an onboarding whose row-write
  // failed. Without it their public card 404s and their first project INSERT hits a
  // raw FK error, so route them through onboarding (which creates the row) first.
  //
  // The row is also what the dashboard displays: profiles is the single source the
  // public card reads, so header/tabs must show the same values — not auth metadata,
  // which can drift from it.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id, username, name, bio, avatar_url, social_links, twitter, github")
    .eq("id", user.id)
    .maybeSingle();
  if (!profileRow) redirect("/onboarding");

  return (
    <Suspense>
      <DashboardClient user={user} profile={profileRow as DashboardProfile} />
    </Suspense>
  );
}
