import type { NextConfig } from "next";

// Baseline security headers applied to every app route EXCEPT /api/preview, which
// serves untrusted uploaded content and deliberately sets its own headers
// (X-Frame-Options/CSP/Referrer-Policy) — we must not override those here.
//
// Intentionally conservative: no Content-Security-Policy script-src (would break
// Next's inline bootstrap scripts) and no global X-Frame-Options/frame-ancestors
// (the landing PiP embeds sandbox-origin previews; framing is handled per-route).
// These four are safe everywhere and don't alter any visible behavior.
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
