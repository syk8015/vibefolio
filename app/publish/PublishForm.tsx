"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function PublishForm() {
  const [raw, setRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit() {
    setError(null);
    const trimmed = raw.trim();
    if (!trimmed) {
      setError("AI가 준 JSON을 붙여넣어 주세요.");
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      setError(
        /^https?:\/\//i.test(trimmed)
          ? "URL만으로는 부족해요 — 제목·설명이 담긴 JSON을 붙여넣어 주세요."
          : "JSON을 읽을 수 없어요. AI가 준 { ... } 형식 그대로 붙여넣어 주세요.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "올리지 못했어요. 잠시 후 다시 시도해 주세요.");
        setSubmitting(false);
        return;
      }
      router.push(`/dashboard?review=${body.projectId}`);
    } catch {
      setError("네트워크 오류로 올리지 못했어요.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link href="/dashboard" className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}>
          ← 대시보드
        </Link>

        <h1 className="vf-serif-display mt-6 mb-2" style={{ fontSize: "clamp(1.6rem, 4vw, 2rem)", fontWeight: 500 }}>
          AI가 준 걸 붙여넣기
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>
          셸이 없는 AI(챗봇)를 쓰고 있나요? AI에게 publish 페이로드를 만들어 달라고 한 뒤,
          그 JSON을 여기 붙여넣으면 초안으로 올라가요. 붙여넣을 프롬프트는{" "}
          <Link href="/dashboard" style={{ color: "var(--text-primary)", textDecoration: "underline" }}>대시보드 → 연결</Link> 탭에 있어요.
        </p>

        <textarea
          className="vf-input w-full"
          style={{ minHeight: 220, fontFamily: "var(--font-mono), monospace", fontSize: "0.85rem", lineHeight: 1.6 }}
          placeholder={'{\n  "title": "...",\n  "description": "...",\n  "demoHighlights": "...",\n  "tags": ["Claude Code"],\n  "contentType": "web-app",\n  "deployUrl": "https://..."\n}'}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />

        {error && (
          <p className="text-sm mt-3" style={{ color: "var(--danger, #c0392b)", fontFamily: "var(--font-nunito)" }}>{error}</p>
        )}

        <div className="flex items-center gap-3 mt-5">
          <button onClick={submit} disabled={submitting} className="vf-button-primary" style={{ opacity: submitting ? 0.6 : 1 }}>
            {submitting ? "올리는 중…" : "초안으로 올리기"}
          </button>
          <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            공개 전에 대시보드에서 확인할 수 있어요
          </span>
        </div>
      </div>
    </div>
  );
}
