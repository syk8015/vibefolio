"use client";

import { useState } from "react";

export default function CopyLinkButton({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/${username}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const el = document.createElement("input");
      el.value = `${window.location.origin}/${username}`;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-150"
      style={{
        border: `1px solid ${copied ? "rgba(34,197,94,0.5)" : "var(--border-bright)"}`,
        color: copied ? "#22c55e" : "var(--text-secondary)",
        background: copied ? "rgba(34,197,94,0.08)" : "var(--surface)",
        fontFamily: "var(--font-nunito)",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          복사됨!
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 4V2.5A1.5 1.5 0 006.5 1h-4A1.5 1.5 0 001 2.5v4A1.5 1.5 0 002.5 8H4" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          링크 복사
        </>
      )}
    </button>
  );
}
