import type { NextConfig } from "next";

// Baseline security headers applied to every app route EXCEPT /api/preview, which
// serves untrusted uploaded content and deliberately sets its own headers
// (X-Frame-Options/CSP/Referrer-Policy) — we must not override those here.
//
// No CSP script-src (would break Next's inline bootstrap scripts). We DO set
// frame-ancestors 'self' / X-Frame-Options SAMEORIGIN globally: the only in-app
// framing is same-origin (landing PiP frames /{username}?showcase=1, ViewportFrame
// frames /{username}?embed=1; the cross-origin live embed points at /api/preview,
// which is excluded here and sets its own frame headers). This closes clickjacking
// of /dashboard, /login, /onboarding without breaking any current embed.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "image.thum.io" },
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "i.pravatar.cc" },
    ],
  },
  async redirects() {
    // Public profiles live at /{username}; the @-prefixed form is what people
    // type from social bios and what the endcap/share copy shows. Map it back to
    // the canonical path. Runs before middleware, so no wasted auth round-trip.
    return [
      { source: "/@:username", destination: "/:username", permanent: false },
      { source: "/@:username/:slug", destination: "/:username/:slug", permanent: false },
    ];
  },
  async rewrites() {
    // OAuth 발견 문서는 `/.well-known/…`에 있어야 한다(RFC 9728·8414). app/ 안에
    // 점으로 시작하는 폴더는 라우트로 잡히지 않으므로 평범한 경로에 두고 여기서 잇는다.
    //
    // 주소가 둘인 이유: 우리 MCP 엔드포인트가 /api/mcp라, 클라이언트는 **경로를 끼운**
    // 주소를 먼저 찾고 없으면 뿌리 주소를 찾는다(RFC 9728 §3.1). 둘 다 같은 문서를 낸다.
    return [
      {
        source: "/.well-known/oauth-protected-resource/api/mcp",
        destination: "/api/oauth/meta/protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/meta/protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/meta/authorization-server",
      },
    ];
  },
  async headers() {
    return [
      {
        // All paths except the untrusted-content preview route.
        source: "/((?!api/preview).*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
