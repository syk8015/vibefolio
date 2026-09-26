import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import SettingsClient from "@/components/settings/SettingsClient";

export async function generateMetadata() {
  const locale = await getLocale();
  return { title: locale === "en" ? "Settings · Nookframe" : "설정 · Nookframe" };
}

// 설정 화면(2026-09-26). 미들웨어가 비로그인 → /login?next=/settings로 먼저 보내지만, 여기서도
// 한 번 더 막는다(대시보드와 같은 방식). 아이디는 회원 탈퇴 확인 문자열로 쓴다 — profiles가 정본.
export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/onboarding");

  return (
    // LoginMethods가 useSearchParams(연결 결과 표식)를 읽는다.
    <Suspense>
      <SettingsClient email={user.email ?? ""} username={profile.username} />
    </Suspense>
  );
}
