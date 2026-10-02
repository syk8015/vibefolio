import type { Metadata } from "next";
import { Inter, Hahmlet, JetBrains_Mono } from "next/font/google";
import FirstTouch from "@/components/FirstTouch";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const hahmlet = Hahmlet({
  // ⚠️ 변수명이 `--font-serif`가 아니다. 화면이 쓰는 `--font-serif`는 globals.css가
  // 만든다: 우리가 잘라 만든 한글 서브셋(HahmletKR)을 **맨 앞**에 두고, 그 뒤에
  // 이 구글 Hahmlet(=여기)을 폴백으로 둔 스택이다. 서브셋에 없는 글자(유저가 올린
  // 작품 제목 등)는 여기로 넘어가 구글 조각을 그때만 받는다.
  // 서브셋 재생성: `node scripts/build-font-subset.mjs` (누락 검사는 --check).
  variable: "--font-serif-full",
  preload: false,
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

// 설명·OG 언어도 보는 사람 언어로(2026-10-02) — 제목은 브랜드라 두 언어가 같다. 하위 화면의
// generateMetadata가 title·description·openGraph를 덮어쓴다(openGraph는 통째로 바뀐다).
const SITE_TITLE = "Nookframe — Vibe Coding Portfolio";
const SITE_DESCRIPTION = {
  ko: "바이브코더를 위한 라이브 포트폴리오. 프로젝트를 전시하고, 링크 하나로 나를 소개하세요.",
  en: "The live portfolio for vibe coders. Show your projects and introduce yourself with one link.",
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const description = SITE_DESCRIPTION[locale];
  return {
    title: SITE_TITLE,
    description,
    metadataBase: new URL("https://nookframe.com"),
    openGraph: {
      title: SITE_TITLE,
      description,
      url: "https://nookframe.com",
      siteName: "Nookframe",
      type: "website",
      locale: locale === "en" ? "en_US" : "ko_KR",
      alternateLocale: locale === "en" ? "ko_KR" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 언어는 서버가 정한다(쿠키 → Accept-Language → ko, lib/i18n/server.ts). <html lang>이 늘 "ko"면
  // 영어 화면도 JS를 안 돌리는 검색·미리보기 로봇에겐 한국어 페이지로 읽힌다(2026-10-02).
  // 이걸 읽으면 루트 아래 전부가 매 요청 렌더가 된다 — 이미 랜딩·명함·로그인·가입·대시보드·설정이
  // 그랬고, 새로 동적이 되는 건 비밀번호 찾기·재설정·온보딩 같은 가벼운 화면뿐이다.
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${inter.variable} ${hahmlet.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* CSS가 도착하기 전에도 브라우저가 캔버스를 어둡게 칠하도록 알려준다
            (없으면 다크 테마에서 새로고침할 때마다 흰 화면이 번쩍인다).
            OS 설정을 따르는 기본값이고, 저장된 테마가 다르면 아래 스크립트가 덮어쓴다. */}
        <meta name="color-scheme" content="dark light" />
        {/* 모바일 브라우저 상·하단 바 색. 스크립트가 실제 테마로 맞춰준다. */}
        <meta name="theme-color" content="#1a1612" />
        {/* 페인트 전에 실행되는 테마 부트스트랩. ThemeToggle의 getInitialTheme()과
            같은 규칙 — 저장된 선택이 우선, 없으면 OS를 따른다. ('light' 하드코딩은
            OS 다크 유저에게 light→dark 번쩍임을 만들어서 폐기.)

            하이드레이션 감시가 붙어 있다 — React가 <html>을 하이드레이트하는 순간
            런타임에 붙인 data-theme/style이 한 프레임 지워지고, 그 사이 기본값인
            라이트 팔레트(크림색)가 그려진다. 2026-08-20 실측: load 후 ~70ms에
            9ms 동안 rgb(253,250,243)로 번쩍임. MutationObserver 콜백은 페인트 전에
            도는 마이크로태스크라 즉시 되돌리면 그 프레임 자체가 사라진다. */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){
var r=document.documentElement;
function resolve(){try{var s=localStorage.getItem('vf-theme');if(s==='dark'||s==='light')return s;}catch(e){}try{return window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}catch(e){return 'dark';}}
function apply(t){r.setAttribute('data-theme',t);r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'#1a1612':'#fdfaf3');}
apply(resolve());
try{new MutationObserver(function(){if(!r.getAttribute('data-theme')||!r.style.colorScheme)apply(resolve());}).observe(r,{attributes:true,attributeFilter:['data-theme','style']});}catch(e){}
})();
        `.trim() }} />
      </head>
      <body className="min-h-screen">
        <LocaleProvider initialLocale={locale}>
          <FirstTouch />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
