"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Props {
  username: string;
  name: string;
  avatarUrl?: string;
}

export default function HomeProfileMenu({ username, name, avatarUrl }: Props) {
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

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
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
        className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-sm font-black flex-shrink-0 transition-opacity hover:opacity-80"
        style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", border: "none", cursor: "pointer" }}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
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
            설정
          </button>
          <div style={{ height: "1px", background: "var(--border)" }} />
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 text-sm font-bold transition-colors hover:opacity-70"
            style={{ color: "#ef4444", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer", display: "block" }}
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
