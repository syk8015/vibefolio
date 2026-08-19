"use client";

import { useState } from "react";
import { copyText } from "@/lib/clipboard";

// 캡션·추적 링크 공용 복사 버튼. lib/clipboard.ts의 copyText가 클립보드
// API + execCommand 폴백을 이미 처리하므로 여기선 "복사됨" 표시만 담당.
export default function CopyButton({
  text,
  label = "복사",
  compact = false,
}: {
  text: string;
  label?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    if (!text) return;
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!text}
      className={`rounded-full font-semibold transition-colors disabled:opacity-40 ${
        compact ? "px-2 py-0.5" : "px-3 py-1 text-xs"
      }`}
      style={{
        fontSize: compact ? "0.62rem" : undefined,
        background: copied ? "var(--surface-soft-hover)" : "var(--surface-soft)",
        color: "var(--text-secondary)",
        border: "none",
        cursor: text ? "pointer" : "not-allowed",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? "복사됨" : label}
    </button>
  );
}
