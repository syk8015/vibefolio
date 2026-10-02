import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/public";
import { introFilmIssue, type IntroFilm } from "@/lib/introFilm/schema";
import IntroFilmPlayer from "@/components/introFilm/IntroFilmPlayer";

export const metadata: Metadata = {
  robots: { index: false, follow: false }, // robots.ts disallow와 이중 방어
};

// 소개 영상 렌더 전용 페이지(2026-10-02, docs/intro-film.md 5단계) — 맥 워커가 1920×1080으로 열고
// window.__introFilm.renderAt(t)로 프레임을 하나씩 그려 찍는다. 명함과 **같은 재생기·같은 글꼴**이라
// 파일과 화면이 어긋나지 않는다. 공개된 작품의 공개 칸만 익명 키로 읽는다(초안은 RLS가 막는다).
export default async function IntroRenderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { id } = await params;
  const { locale: localeParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await createPublicClient()
    .from("projects")
    .select("id, title, intro_film")
    .eq("id", id)
    .maybeSingle();
  if (!data?.intro_film || introFilmIssue(data.intro_film)) notFound();
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000" }}>
      <IntroFilmPlayer
        film={data.intro_film as IntroFilm}
        locale={localeParam === "ko" ? "ko" : "en"}
        title={String(data.title ?? "")}
        fit="contain"
        capture
      />
    </div>
  );
}
