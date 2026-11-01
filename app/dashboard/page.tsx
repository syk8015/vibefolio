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

  // 미니 명함의 No.는 실물 명함(MeishiBig)과 같은 정의 — 공개 작품 수.
  // 탭 카운트는 관리 대상 전체(공개+초안).
  const [{ count: publishedCount }, { count: totalCount }] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("is_draft", false),
    supabase.from("projects").select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  // 비상 정지(lib/siteLock.ts) — 잠겨 있으면 맨 위에 띠. SQL 적용 전·읽기 실패면 띠 없음.
  const { data: locks } = await supabase.rpc("site_locks");
  const siteLock = locks?.readonly ? "readonly" : locks?.uploadsClosed ? "uploads" : null;

  return (
    <Suspense>
      <DashboardClient
        siteLock={siteLock}
        user={user}
        profile={profileRow as DashboardProfile}
        publishedCount={publishedCount ?? 0}
        totalCount={totalCount ?? 0}
      />
    </Suspense>
  );
}
