"use client";

import { useState } from "react";
import { sanitizeCustomCss } from "@/lib/sanitizeCss";
import { scopeCustomCss } from "@/lib/scopeCss";

interface Props {
  customCss: string;
}

export default function PortfolioModeToggle({ customCss }: Props) {
  const [special, setSpecial] = useState(false);

  return (
    <>
      {/* Inject custom CSS only when special mode is active. sanitizeCustomCss blocks
          </style breakout (script injection); scopeCustomCss confines every selector to
          #vf-custom-scope so the CSS can restyle the portfolio content but never target
          the report button, this toggle, or the page chrome (all outside the scope).
          Overlays are separately trapped by isolation:isolate on the scope element. */}
      {special && (
        <style dangerouslySetInnerHTML={{ __html: scopeCustomCss(sanitizeCustomCss(customCss), "#vf-custom-scope") }} />
      )}

      <button
        onClick={() => setSpecial((v) => !v)}
        className="fixed bottom-5 right-5 z-50 transition-all duration-200 hover:scale-105"
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        {special ? (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border-bright)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-nunito)",
              backdropFilter: "blur(8px)",
            }}
          >
            ← 일반 명함으로
          </div>
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black"
            style={{
              background: "repeating-linear-gradient(45deg, #f59e0b, #f59e0b 6px, #1c1c1c 6px, #1c1c1c 12px)",
              border: "2px solid #f59e0b",
              color: "#fff",
              fontFamily: "var(--font-nunito)",
              letterSpacing: "0.05em",
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
            }}
          >
            🚧 스페셜 명함 보기
          </div>
        )}
      </button>
    </>
  );
}
