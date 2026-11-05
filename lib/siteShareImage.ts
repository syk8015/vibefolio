// 홈·일반 화면의 공유 미리보기 그림(1200×630 정적 PNG, public/og/). 언어별 한 장씩 — 어느 그림이 나갈지는
// 그 요청의 언어(lib/i18n/server.ts getLocale)가 정한다: 링크 미리보기 로봇은 영어, 카카오톡만 한국어.
// 파일 규칙(app/opengraph-image.png)으로 두면 언어를 못 고르고 설정(metadata)을 늘 이겨서 public/로 옮겼다(2026-11-05).
// 다시 그리기: 바탕 #f4ede0 · 워드마크 JetBrains Mono 500 113px + 커서 블록 61×114 · 아랫글 #6a5e4e 42px
// (영어 Inter 500, 한국어 Apple SD Gothic Neo) · nookframe.com 22.5px — Chrome으로 1200×630을 찍는다.
// 그림을 바꾸면 파일 이름도 바꾼다: 미리보기 로봇은 그림을 주소로 오래 기억한다.
import type { Locale } from "@/lib/i18n/config";

const ALT: Record<Locale, string> = {
  en: "nookframe — The live portfolio for vibe coders",
  ko: "nookframe — 바이브코더를 위한 라이브 포트폴리오",
};

export function siteShareImage(locale: Locale) {
  return { url: `/og/home-${locale}.png`, width: 1200, height: 630, alt: ALT[locale] };
}
