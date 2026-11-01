import type { MetadataRoute } from "next";

// Allow crawling of public pages (landing + /@username 명함), keep private/app
// surfaces out. Points crawlers at the profile sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /internal/ = 겉 미끼(lib/bait.ts) — 착한 로봇은 안 들어오고, 들어오는 건 공격 도구다.
      disallow: ["/dashboard", "/onboarding", "/admin", "/api", "/promo-record", "/intro-render", "/internal/"],
    },
    sitemap: "https://nookframe.com/sitemap.xml",
    host: "https://nookframe.com",
  };
}
