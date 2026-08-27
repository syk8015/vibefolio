import React from "react";

type PlatformConfig = {
  name: string;
  color: string;
  getHandle: (path: string) => string;
  icon: React.ReactNode;
};

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="white" xmlns="http://www.w3.org/2000/svg">
    <path d={d} />
  </svg>
);

const PLATFORM_MAP: Record<string, PlatformConfig> = {
  "instagram.com": {
    name: "Instagram",
    color: "#E1306C",
    getHandle: (path) => `@${path}`,
    icon: <Icon d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />,
  },
  "twitter.com": {
    name: "X",
    color: "#000000",
    getHandle: (path) => `@${path.replace("@", "")}`,
    icon: <Icon d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />,
  },
  "x.com": {
    name: "X",
    color: "#000000",
    getHandle: (path) => `@${path.replace("@", "")}`,
    icon: <Icon d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />,
  },
  "github.com": {
    name: "GitHub",
    color: "#24292e",
    getHandle: (path) => `@${path}`,
    icon: <Icon d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />,
  },
  "linkedin.com": {
    name: "LinkedIn",
    color: "#0077B5",
    getHandle: (path) => {
      const parts = path.split("/");
      const idx = parts.indexOf("in");
      return `@${idx >= 0 ? parts[idx + 1] : path}`;
    },
    icon: <Icon d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />,
  },
  "youtube.com": {
    name: "YouTube",
    color: "#FF0000",
    getHandle: (path) => path.startsWith("@") ? path : `@${path}`,
    icon: <Icon d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />,
  },
  "tiktok.com": {
    name: "TikTok",
    color: "#010101",
    getHandle: (path) => path.startsWith("@") ? path : `@${path}`,
    icon: <Icon d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />,
  },
  "facebook.com": {
    name: "Facebook",
    color: "#1877F2",
    getHandle: (path) => `@${path}`,
    icon: <Icon d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />,
  },
  "threads.net": {
    name: "Threads",
    color: "#000000",
    getHandle: (path) => `@${path.replace("@", "")}`,
    icon: <Icon d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.689-2.044 1.679-1.788 1.974-4.142 1.92-5.692-.056-1.55-.241-3.904-1.92-5.692-1.33-1.413-3.065-2.024-5.689-2.044h-.006c-2.623.02-4.358.631-5.689 2.044" />,
  },
};

// 홍보 클립 관리(/admin/promo)의 채널 버튼이 쓰는 조회구 — 로고 SVG와 브랜드
// 색을 그쪽에 복제하지 않고 명함이 쓰는 것과 같은 것을 그대로 빌려 쓴다.
// host는 PLATFORM_MAP의 키(예: "instagram.com").
export function getSocialBrand(host: string): { name: string; color: string; icon: React.ReactNode } | null {
  const config = PLATFORM_MAP[host];
  if (!config) return null;
  return { name: config.name, color: config.color, icon: config.icon };
}

// Exposed so the Meishi card can render compact "dot" versions of the
// same links the badge component would render in its full pill form.
export function getSocialMeta(url: string): {
  name: string;
  color: string;
  handle: string;
  href: string;
  icon: React.ReactNode;
} | null {
  const parsed = parseSocialUrl(url);
  if (!parsed) return null;
  return {
    name: parsed.config.name,
    color: parsed.config.color,
    handle: parsed.handle,
    href: url.startsWith("http") ? url : `https://${url}`,
    icon: parsed.config.icon,
  };
}

function parseSocialUrl(url: string): { config: PlatformConfig; handle: string } | null {
  if (!url.trim()) return null;
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const u = new URL(normalized);
    const host = u.hostname.replace("www.", "");
    const path = u.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    const config = PLATFORM_MAP[host];
    if (!config) return null;
    return { config, handle: config.getHandle(path) };
  } catch {
    return null;
  }
}

export default function SocialBadge({ url }: { url: string }) {
  const parsed = parseSocialUrl(url);
  if (!parsed) return null;
  const { config, handle } = parsed;
  const href = url.startsWith("http") ? url : `https://${url}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 transition-opacity hover:opacity-75"
      style={{
        border: "1px solid var(--border-bright)",
        borderRadius: "999px",
        padding: "6px 14px 6px 8px",
        background: "var(--surface)",
        textDecoration: "none",
        fontFamily: "var(--font-nunito)",
      }}
    >
      <span
        className="flex items-center justify-center rounded-full flex-shrink-0"
        style={{ width: 22, height: 22, background: config.color }}
      >
        {config.icon}
      </span>
      <span
        className="text-sm font-bold"
        style={{ color: "var(--text-primary)" }}
      >
        {handle}
      </span>
    </a>
  );
}
