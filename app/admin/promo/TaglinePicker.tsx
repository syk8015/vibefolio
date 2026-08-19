"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loggedInTaglines, loggedInTaglinesEn } from "@/lib/loggedInTaglines";
import { PROMO_OPENINGS, type PromoOpening } from "@/lib/promo";

type Pool = "ko" | "en";
type Format = "vertical" | "horizontal";

// 문구별 촬영 이력 — page.tsx가 promo_clips를 문구 텍스트로 묶어 넘긴다.
export type TaglineShots = Record<string, { done: number; queued: number; failed: number }>;

// lib/loggedInTaglines.ts 풀 전체를 스크롤 리스트로 보여주고, 클릭한 문구를
// 촬영 큐(promo_clips)에 넣는다. 실제 촬영은 여기서 안 일어난다 — 관리자가
// npm run promo:batch를 로컬에서 실행해야 큐가 소화된다(계획 문서 참고).
// 풀이 100개를 넘어가서, 이미 찍은 문구는 배지로 표시하고 "미촬영만" 필터를 둔다.
export default function TaglinePicker({ shots = {} }: { shots?: TaglineShots }) {
  const router = useRouter();
  const [pool, setPool] = useState<Pool>("ko");
  const [format, setFormat] = useState<Format>("vertical");
  const [opening, setOpening] = useState<PromoOpening>("hook");
  const [onlyUnshot, setOnlyUnshot] = useState(false);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [justQueued, setJustQueued] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = pool === "en" ? loggedInTaglinesEn : loggedInTaglines;
  const unshotCount = useMemo(() => all.filter((t) => !shots[t.text]).length, [all, shots]);
  const items = onlyUnshot ? all.filter((t) => !shots[t.text]) : all;

  async function enqueue(text: string) {
    setBusyText(text);
    setError(null);
    try {
      const res = await fetch("/api/admin/promo/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: pool, text, format, opening }),
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
        <span style={{ width: 1, height: 18, background: "var(--border)" }} />
        {(Object.keys(PROMO_OPENINGS) as PromoOpening[]).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOpening(o)}
            title={PROMO_OPENINGS[o].hint}
            className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
            style={{
              background: opening === o ? "var(--blue)" : "var(--surface-soft)",
              color: opening === o ? "var(--bg)" : "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {PROMO_OPENINGS[o].label}
          </button>
        ))}
        <span style={{ width: 1, height: 18, background: "var(--border)" }} />
        <button
          type="button"
          onClick={() => setOnlyUnshot((v) => !v)}
          className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
          style={{
            background: onlyUnshot ? "var(--blue)" : "var(--surface-soft)",
            color: onlyUnshot ? "var(--bg)" : "var(--text-secondary)",
            border: "none",
            cursor: "pointer",
          }}
        >
          아직 안 찍은 것만 · {unshotCount}
        </button>
      </div>

      <p style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>{PROMO_OPENINGS[opening].hint}</p>

      {error && (
        <div className="px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(179,71,71,0.12)", color: "#8e3535" }}>
          {error}
        </div>
      )}

      <div className="flex flex-col gap-1.5 overflow-y-auto" style={{ maxHeight: 420 }}>
        {items.length === 0 && (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>
            이 풀은 전부 촬영했어요.
          </p>
        )}
        {items.map((item) => {
          const shot = shots[item.text];
          const isDone = !!shot && shot.done > 0;
          const isQueued = !!shot && shot.queued > 0;
          return (
            <div
              key={item.text}
              className="flex items-start justify-between gap-3 py-2 px-1"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {shot && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-xs font-semibold shrink-0"
                      style={{
                        background: isDone
                          ? "rgba(46,125,74,0.12)"
                          : isQueued
                            ? "var(--surface-soft)"
                            : "rgba(179,71,71,0.10)",
                        color: isDone ? "#2e7d4a" : isQueued ? "var(--text-muted)" : "#8e3535",
                        fontSize: "0.62rem",
                      }}
                    >
                      {isDone ? `촬영됨${shot.done > 1 ? ` ${shot.done}` : ""}` : isQueued ? "촬영 대기" : "실패"}
                    </span>
                  )}
                  <p
                    className="text-sm truncate"
                    style={{ color: shot ? "var(--text-muted)" : "var(--text-primary)" }}
                  >
                    {item.text}
                  </p>
                </div>
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
                {busyText === item.text
                  ? "추가 중…"
                  : justQueued === item.text
                    ? "큐에 추가됨"
                    : shot
                      ? "다시 촬영"
                      : "촬영 큐에 추가"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
