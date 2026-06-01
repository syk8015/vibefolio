"use client";

import { useState } from "react";
import { sanitizeCustomCss } from "@/lib/sanitizeCss";

interface Props {
  customCss: string;
}

export default function PortfolioModeToggle({ customCss }: Props) {
  const [special, setSpecial] = useState(false);

  return (
    <>
      {/* Inject custom CSS only when special mode is active. Sanitized so a
          malicious owner can't break out of the <style> tag and run script
          on a visitor's session. */}
      {special && <style dangerouslySetInnerHTML={{ __html: sanitizeCustomCss(customCss) }} />}

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
