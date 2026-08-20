import type { Metadata } from "next";
import { Inter, Hahmlet, JetBrains_Mono } from "next/font/google";
import FirstTouch from "@/components/FirstTouch";
import { LocaleProvider } from "@/lib/i18n/client";
import "./globals.css";

const inter = Inter({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const hahmlet = Hahmlet({
  variable: "--font-serif",
  preload: false,
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nookframe — Vibe Coding Portfolio",
  description: "바이브코더를 위한 라이브 포트폴리오. 프로젝트를 전시하고, 링크 하나로 나를 소개하세요.",
  metadataBase: new URL("https://nookframe.com"),
  openGraph: {
    title: "Nookframe — Vibe Coding Portfolio",
    description: "바이브코더를 위한 라이브 포트폴리오. 프로젝트를 전시하고, 링크 하나로 나를 소개하세요.",
    url: "https://nookframe.com",
    siteName: "Nookframe",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nookframe — Vibe Coding Portfolio",
    description: "바이브코더를 위한 라이브 포트폴리오. 프로젝트를 전시하고, 링크 하나로 나를 소개하세요.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${inter.variable} ${hahmlet.variable} ${mono.variable}`} suppressHydrationWarning>
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
(function(){try{var m=document.cookie.match(/(?:^|;\\s*)NEXT_LOCALE=(ko|en)/);var l=m?m[1]:(String(navigator.language||'').toLowerCase().indexOf('en')===0?'en':null);if(l)document.documentElement.lang=l;}catch(e){}})();
        `.trim() }} />
      </head>
      <body className="min-h-screen">
        {/* 쿠키를 서버에서 읽지 않는다 — 루트 레이아웃에서 cookies()를 읽으면
            정적/60s 캐시 페이지 전부가 동적 렌더링으로 강등되기 때문.
            프로바이더가 마운트 후 클라이언트에서 감지한다. */}
        <LocaleProvider>
          <FirstTouch />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
