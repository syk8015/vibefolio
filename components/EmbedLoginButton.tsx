"use client";

import { useState } from "react";

export default function EmbedLoginButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3.5 py-1.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
        style={{
          border: "1px solid var(--border-bright)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-nunito)",
          background: "transparent",
          cursor: "pointer",
        }}
      >
        로그인
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-bright)",
              borderRadius: 18,
              padding: "26px 24px 20px",
              maxWidth: 300,
              width: "100%",
              textAlign: "center",
              fontFamily: "var(--font-nunito)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "var(--blue-tint)",
                border: "1px solid var(--border-bright)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 14px",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>
            <p
              style={{
                color: "var(--text-primary)",
                fontWeight: 800,
                fontSize: "0.95rem",
                marginBottom: 6,
              }}
            >
              로그인은 모바일에서 진행해주세요
            </p>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.78rem",
                fontWeight: 400,
                lineHeight: 1.5,
                marginBottom: 18,
              }}
            >
              모바일 미리보기에서는 로그인을 할 수 없어요. 실제 모바일 기기에서 로그인해 주세요.
            </p>
            <button
              onClick={() => setOpen(false)}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 999,
                background: "var(--blue)",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.8rem",
                fontFamily: "var(--font-nunito)",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 0 16px var(--blue-glow)",
              }}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </>
  );
}
