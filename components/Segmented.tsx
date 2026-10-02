"use client";

// 몇 칸 중 하나 고르기(토스 세그먼트) — 설정의 언어·테마, 검토 창 소개 영상의 글자·분위기가 같이 쓴다.
// 고른 쪽은 한 단계 진한 채움 + 굵게(시각 언어의 "선택" 규칙, globals.css .vf-selectable과 같은 값).
// 칸 바탕(track)은 놓이는 곳보다 한 단계 달라야 보인다 — 설정 줄(채움 위)은 페이지 바탕, 흰 창 안은 옅은 채움.
export function Segmented<V extends string>({ label, value, options, onPick, track = "var(--surface-soft)" }: {
  label: string;
  value: V | null;
  options: { value: V; label: string }[];
  onPick: (v: V) => void;
  track?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 p-[3px] rounded-full shrink-0" style={{ background: track }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onPick(o.value)}
            className="rounded-full transition-colors"
            style={{
              padding: "0.375rem 0.875rem", border: "none", cursor: "pointer",
              background: on ? "var(--surface-active)" : "transparent",
              color: on ? "var(--text-primary)" : "var(--text-secondary)",
              fontSize: "0.875rem", fontWeight: on ? 600 : 500, fontFamily: "var(--font-nunito)",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
