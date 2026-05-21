import type { Metadata } from "next";
import { Inter, Hahmlet, JetBrains_Mono } from "next/font/google";
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
  title: "Vibefolio — Vibe Coding Portfolio",
  description: "바이브코더를 위한 디지털 명함. 프로젝트를 전시하고, 링크 하나로 나를 소개하세요.",
  metadataBase: new URL("https://vibefolio.vercel.app"),
  openGraph: {
    title: "Vibefolio — Vibe Coding Portfolio",
    description: "바이브코더를 위한 디지털 명함. 프로젝트를 전시하고, 링크 하나로 나를 소개하세요.",
    url: "https://vibefolio.vercel.app",
    siteName: "Vibefolio",
    type: "website",
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vibefolio — Vibe Coding Portfolio",
    description: "바이브코더를 위한 디지털 명함. 프로젝트를 전시하고, 링크 하나로 나를 소개하세요.",
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
        {/* Runs before paint to prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){try{var s=localStorage.getItem('vf-theme');document.documentElement.setAttribute('data-theme',(s==='dark'||s==='light')?s:'light');}catch(e){}})();
        `.trim() }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
