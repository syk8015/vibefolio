import type { Metadata } from "next";
import { Inter, Noto_Serif_KR, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const serifKr = Noto_Serif_KR({
  variable: "--font-serif",
  weight: ["400", "500", "600"],
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
    <html lang="ko" className={`${inter.variable} ${serifKr.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Runs before paint to prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){try{var s=localStorage.getItem('vf-theme');document.documentElement.setAttribute('data-theme',(s==='dark'||s==='light')?s:'light');}catch(e){}})();
        `.trim() }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
