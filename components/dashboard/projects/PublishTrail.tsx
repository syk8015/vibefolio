"use client";

import type { CSSProperties } from "react";

// 초안 검토 창 버튼 위의 작은 세 단계 "공개 → 촬영 → 명함에 영상"(2026-10-01 업그레이드).
// 공개 전엔 1단계만 진하게, 공개한 뒤엔 "공개 ✓ → 촬영 대기 중"으로 바뀌어 "촬영을 요청했어요" 문장을 대신한다.
// cur = 지금 단계 · done = 끝남(✓) · wait = 기다리는 중(둘레가 천천히 흐려졌다 진해진다 — 움직임 줄이기 설정이면 멈춤) · todo = 아직.
export type TrailState = "cur" | "done" | "wait" | "todo";
export type TrailStep = { state: TrailState; label: string; title?: string };

export function PublishTrail({ steps }: { steps: TrailStep[] }) {
  return (
    <ol
      className="flex flex-wrap items-center justify-center"
      style={{ listStyle: "none", margin: 0, padding: 0, rowGap: 6, fontFamily: "var(--font-nunito)", fontSize: 13, lineHeight: 1.3 }}
    >
      {steps.map((s, i) => (
        <li
          key={i} className="flex items-center" title={s.title}
          aria-current={s.state === "cur" || s.state === "wait" ? "step" : undefined}
        >
          {i > 0 && (
            <span
              aria-hidden
              style={{
                width: "clamp(14px, 2.2vw, 28px)", margin: "0 clamp(6px, 0.8vw, 10px)",
                borderTop: steps[i - 1].state === "done" ? "1.5px solid var(--text-primary)" : "1.5px dotted var(--border-bright)",
              }}
            />
          )}
          <span className="inline-flex items-center" style={{ gap: 7 }}>
            <TrailDot state={s.state} n={i + 1} />
            <span style={LABEL[s.state]}>{s.label}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const LABEL: Record<TrailState, CSSProperties> = {
  cur: { color: "var(--text-primary)", fontWeight: 600 },
  wait: { color: "var(--text-primary)", fontWeight: 600 },
  done: { color: "var(--text-secondary)", fontWeight: 500 },
  todo: { color: "var(--text-muted)", fontWeight: 500 },
};

function TrailDot({ state, n }: { state: TrailState; n: number }) {
  const base: CSSProperties = {
    position: "relative", width: 17, height: 17, borderRadius: 999, flexShrink: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    fontSize: 10, fontWeight: 700, lineHeight: 1,
  };
  if (state === "done") {
    return (
      <span aria-hidden style={{ ...base, background: "var(--text-primary)", color: "var(--bg)" }}>
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.3l2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "wait") {
    return (
      <span aria-hidden style={{ ...base, background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--text-primary)" }}>
        <span
          className="animate-pulse motion-reduce:animate-none"
          style={{ position: "absolute", inset: 0, borderRadius: 999, boxShadow: "0 0 0 4px var(--blue-tint-strong), 0 0 0 8px var(--blue-tint)" }}
        />
        <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--text-primary)" }} />
      </span>
    );
  }
  return (
    <span
      aria-hidden className="vf-mono"
      style={state === "cur"
        ? { ...base, background: "var(--text-primary)", color: "var(--bg)", boxShadow: "0 0 0 3px var(--blue-tint-strong)" }
        : { ...base, color: "var(--text-muted)", boxShadow: "inset 0 0 0 1.5px var(--border-bright)" }}
    >
      {n}
    </span>
  );
}

// 공개한 뒤 화면의 큰 체크 — 둘레에 잉크·종이색 조각 몇 개(움직이지 않는다).
const BITS: [x: number, y: number, kind: "dash" | "dot" | "square", rotate: number, tone: "ink" | "tan", alpha: number][] = [
  [40, 34, "dash", -35, "ink", 0.45], [22, 70, "dot", 0, "tan", 1], [44, 104, "square", 20, "ink", 0.3], [70, 8, "dot", 0, "ink", 0.25],
  [156, 26, "square", 35, "tan", 1], [178, 60, "dash", 25, "ink", 0.4], [150, 100, "dot", 0, "ink", 0.3], [128, 6, "dash", 60, "tan", 1],
];

export function PublishedMark() {
  return (
    <span
      aria-hidden
      style={{
        position: "relative", width: 64, height: 64, borderRadius: 999, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "var(--text-primary)", color: "var(--bg)", boxShadow: "0 0 0 8px var(--blue-tint)",
      }}
    >
      <svg width="200" height="130" viewBox="0 0 200 130" style={{ position: "absolute", left: -68, top: -33, overflow: "visible", pointerEvents: "none" }}>
        {BITS.map(([x, y, kind, rotate, tone, alpha], i) => {
          const style = { fill: tone === "ink" ? "var(--text-primary)" : "var(--border-bright)", opacity: alpha };
          if (kind === "dot") return <circle key={i} cx={x} cy={y} r="3" style={style} />;
          const w = kind === "dash" ? 10 : 6;
          const h = kind === "dash" ? 3 : 6;
          return <rect key={i} x={x - w / 2} y={y - h / 2} width={w} height={h} rx="1.5" transform={`rotate(${rotate} ${x} ${y})`} style={style} />;
        })}
      </svg>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M5.5 12.5l4.2 4.2 8.8-9.4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
