"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loggedInTaglines, loggedInTaglinesEn } from "@/lib/loggedInTaglines";

type Pool = "ko" | "en";
type Format = "vertical" | "horizontal";

// lib/loggedInTaglines.ts 풀 전체를 스크롤 리스트로 보여주고, 클릭한 문구를
// 촬영 큐(promo_clips)에 넣는다. 실제 촬영은 여기서 안 일어난다 — 관리자가
// npm run promo:batch를 로컬에서 실행해야 큐가 소화된다(계획 문서 참고).
export default function TaglinePicker() {
  const router = useRouter();
  const [pool, setPool] = useState<Pool>("ko");
  const [format, setFormat] = useState<Format>("vertical");
  const [busyText, setBusyText] = useState<string | null>(null);
  const [justQueued, setJustQueued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = pool === "en" ? loggedInTaglinesEn : loggedInTaglines;

  async function enqueue(text: string) {
    setBusyText(text);
    setError(null);
    try {
      const res = await fetch("/api/admin/promo/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: pool, text, format }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setJustQueued(text);
      router.refresh();
      setTimeout(() => setJustQueued((t) => (t === text ? null : t)), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "큐 등록에 실패했어요.");
    } finally {
      setBusyText(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {(["ko", "en"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPool(p)}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
            style={{
              background: pool === p ? "var(--blue)" : "var(--surface-soft)",
              color: pool === p ? "var(--bg)" : "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {p === "ko" ? "한국어" : "영어"} · {p === "ko" ? loggedInTaglines.length : loggedInTaglinesEn.length}
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: "var(--border)" }} />
        {(["vertical", "horizontal"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFormat(f)}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
            style={{
              background: format === f ? "var(--blue)" : "var(--surface-soft)",
              color: format === f ? "var(--bg)" : "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {f === "vertical" ? "세로 9:16 (릴스·쇼츠)" : "가로 16:9 (유튜브)"}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(179,71,71,0.12)", color: "#8e3535" }}>
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 420 }}>
        {items.map((item) => (
          <div
            key={item.text}
            className="flex items-start justify-between gap-3 py-2 px-1"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{item.text}</p>
              {item.reply && (
                <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                  <span aria-hidden style={{ opacity: 0.7 }}>↳</span> {item.reply}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => enqueue(item.text)}
              disabled={busyText === item.text}
              className="px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-colors disabled:opacity-50"
              style={{
                background: justQueued === item.text ? "var(--surface-soft-hover)" : "var(--surface-soft)",
                color: "var(--text-secondary)",
                border: "none",
                cursor: busyText === item.text ? "not-allowed" : "pointer",
              }}
            >
              {busyText === item.text ? "추가 중…" : justQueued === item.text ? "큐에 추가됨" : "촬영 큐에 추가"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
