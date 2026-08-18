import type { Metadata } from "next";
import LoggedInHeadline from "@/components/LoggedInHeadline";
import { loggedInTaglines, loggedInTaglinesEn } from "@/lib/loggedInTaglines";
import type { Locale } from "@/lib/i18n/config";

export const metadata: Metadata = {
  robots: { index: false, follow: false }, // robots.ts disallow와 이중 방어
};

// 홍보 클립 촬영 전용 페이지 — 로그인 없이, 사이트 브랜드 배경 위에 밈
// 태그라인 타이핑 애니메이션만 보여준다(내비게이션·인사말·버튼 없음). 로그인
// 후 메인(app/page.tsx)을 찍던 이전 방식은 폐기 — 전용 계정·세션 자동화가
// 통째로 불필요해짐(2026-08-15 사용자 지시).
//
// local-runner/promo-record.ts가 `?promo=<문구>&locale=<ko|en>&format=<vertical|
// horizontal>`로 이 페이지를 열어 화면을 녹화한다. 로고 엔드캡("nookframe.com"
// 타이핑→n에서 멈춰 착지)은 이 페이지가 아니라 촬영 후
// local-runner/promo-endcap.ts가 후처리로 이어붙인다 — 페이지는 태그라인
// 재생에만 집중.
export default async function PromoRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ promo?: string; locale?: string; format?: string }>;
}) {
  const { promo, locale: localeParam, format } = await searchParams;
  const locale: Locale = localeParam === "en" ? "en" : "ko";
  const pool = locale === "en" ? loggedInTaglinesEn : loggedInTaglines;
  const forced = promo ? pool.find((item) => item.text === promo) : undefined;
  const isHorizontal = format === "horizontal";

  return (
    <>
      {/* 헤드라인 폰트 크기의 clamp 상한(2.5rem)을 이 페이지에서만 푼다.
          촬영은 헤드리스 브라우저를 최종 출력 해상도(1080×1920 / 1920×1080)로
          띄우는데, 상한이 걸리면 뷰포트가 커질수록 글자만 상대적으로
          작아져 로그인 후 메인에서 보던 비율과 달라진다. 순수 vw로 고정하면
          어떤 해상도로 찍어도 화면상의 비율이 같다(2026-08-18). */}
      <style>{`
        .vf-logged-in-headline h1 { font-size: 3.4vw !important; }
        .vf-logged-in-headline p  { font-size: 2.8vw !important; }
      `}</style>
    <main
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100vw",
        height: "100vh",
        background: "var(--bg)",
        padding: isHorizontal ? "0 10vw" : "0 6vw",
      }}
    >
      <LoggedInHeadline
        locale={locale}
        forceText={forced?.text}
        forceReply={forced?.reply}
        promoNotFound={!!promo && !forced}
      />
    </main>
    </>
  );
}
