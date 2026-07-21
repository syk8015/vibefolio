import type { MetadataRoute } from "next";

// Allow crawling of public pages (landing + /@username 명함), keep private/app
// surfaces out. Points crawlers at the profile sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/onboarding", "/admin", "/api"],
    },
    sitemap: "https://nookframe.com/sitemap.xml",
    host: "https://nookframe.com",
  };
}
