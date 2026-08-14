import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import PublishForm from "./PublishForm";

// 이 페이지는 auth 쿠키 때문에 이미 매 요청 렌더 — 탭 제목도 서버에서 locale 분기.
export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: locale === "en" ? "Paste your AI draft · Nookframe" : "AI 초안 붙여넣기 · Nookframe",
  };
}

// 셸 없는 AI(챗봇) 경로: 유저가 AI가 뱉은 publish JSON을 여기 붙여넣으면 쿠키 세션으로
// /api/ingest에 제출된다(토큰 불필요 — 서버가 세션 uid 사용). CLI/MCP를 쓸 수 있는
// 에이전트는 이 페이지가 필요 없다.
export default async function PublishPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 대시보드와 동일한 self-heal: 프로필 행이 없으면 프로젝트 INSERT의 FK가 깨지므로 온보딩으로.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profileRow) redirect("/onboarding");

  return <PublishForm />;
}
