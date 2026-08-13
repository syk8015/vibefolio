"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { useT } from "@/lib/i18n/client";

export default function EmbedLoginButton() {
  const [open, setOpen] = useState(false);
  const { t } = useT();

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
        {t.theater.login}
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} ariaLabel={t.theater.embedLoginAria} maxWidth={300} padding="26px 24px 20px">
          <div style={{ textAlign: "center" }}>
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
              {t.theater.embedLoginTitle}
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
              {t.theater.embedLoginBody}
            </p>
            <button
              onClick={() => setOpen(false)}
              style={{
                width: "100%",
                padding: "10px 16px",
                borderRadius: 999,
                background: "var(--blue)",
                color: "var(--bg)",
                fontWeight: 700,
                fontSize: "0.8rem",
                fontFamily: "var(--font-nunito)",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 0 16px var(--blue-glow)",
              }}
            >
              {t.common.ok}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
