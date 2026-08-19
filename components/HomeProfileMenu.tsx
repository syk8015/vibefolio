"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

interface Props {
  username: string;
  name: string;
  avatarUrl?: string;
  // 랜딩(서버·동적)이 getLocale() 값을 내려준다 — 루트 LocaleProvider는
  // 마운트 후에야 언어를 알아서 useT를 쓰면 첫 페인트가 ko로 깜빡인다.
  locale: Locale;
}

export default function HomeProfileMenu({ username, name, avatarUrl, locale }: Props) {
  const t = getDictionary(locale);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const avatarLetter = name.charAt(0).toUpperCase();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // supabase-js를 부르지 않는다 — 이 한 줄 때문에 로그아웃 상태 방문자에게도
  // supabase 청크(전송 55KB)가 랜딩 번들로 내려갔다. 세션 쿠키는 서버에서 지운다.
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} className="flex items-center gap-3 relative">
      <span className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
        @{username}
      </span>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-black flex-shrink-0 transition-opacity hover:opacity-80"
        style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", border: "none", cursor: "pointer" }}
      >
        {avatarUrl
          ? <Image src={avatarUrl} alt={name} fill sizes="36px" unoptimized className="object-cover" />
          : avatarLetter}
      </button>

      {open && (
        <div
          className="absolute top-12 right-0 rounded-xl overflow-hidden z-50"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-bright)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
            minWidth: "140px",
          }}
        >
          <button
            onClick={() => { setOpen(false); }}
            className="w-full text-left px-4 py-3 text-sm font-bold transition-colors hover:opacity-70"
            style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer", display: "block" }}
          >
            {t.landing.settings}
          </button>
          <div style={{ height: "1px", background: "var(--border)" }} />
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 text-sm font-bold transition-colors hover:opacity-70"
            style={{ color: "#ef4444", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer", display: "block" }}
          >
            {t.dashboard.logout}
          </button>
        </div>
      )}
    </div>
  );
}
