import type { Metadata } from "next";
import { Inter, Hahmlet, JetBrains_Mono } from "next/font/google";
import FirstTouch from "@/components/FirstTouch";
import { LocaleProvider } from "@/lib/i18n/client";
import "./globals.css";

const inter = Inter({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const hahmlet = Hahmlet({
  variable: "--font-serif",
  weight: ["300", "400", "500", "600"],
  preload: false,
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
        {/* Korean glyphs: next/font/google doesn't expose the `korean` subset
            for CJK fonts, so Hangul was falling back to the system serif.
            Loading Noto Serif KR via the Google Fonts CSS endpoint uses
            unicode-range subsetting to serve the right glyphs on demand. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Runs before paint to prevent flash of wrong theme. Mirrors ThemeToggle's
            getInitialTheme(): stored choice wins, else follow the OS. Hard-coding 'light'
            here made OS-dark users flash light→dark once ThemeToggle mounted. */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){try{var s=localStorage.getItem('vf-theme');var t=(s==='dark'||s==='light')?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
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
