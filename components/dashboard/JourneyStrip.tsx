// 연결 창의 3칸 진행 줄(업그레이드, 2026-10-01 사용자 확정) — 큰 버튼 위에서 "어디까지 왔나"를 그림으로.
//
// 아이콘은 같은 굵기의 선 아이콘 한 벌이다(10-01 사용자: 도구 로고·n▮ 마크·명함 그림을 섞던 첫 시안이
// "이상하다"). 할 일 그 자체를 그린다: 복사 → 올림/붙여넣기/주소 → 프레임. 색은 늘 잉크 한 가지라
// 다크 테마에선 변수만 뒤집힌다.
// 칸 모양: todo = 아직(옅은 테) · now = 지금 내 차례(잉크 테, 굵은 이름) · wait = AI를 기다림(잉크 테 둘레가
// 천천히 숨 쉰다 — 움직임 줄이기 설정이면 멈춘 테) · done = 끝(잉크로 채운 원 + ✓) · err = 실패(빨간 테).
// 이음선은 끝난 칸 뒤로만 잉크 실선, 나머지는 점선.

export type JourneyState = "todo" | "now" | "wait" | "done" | "err";
export type JourneyIcon = "copy" | "upload" | "paste" | "link" | "frame";
export interface JourneyStep {
  icon: JourneyIcon;
  label: string;
  state: JourneyState;
}

const ICON_PATHS: Record<JourneyIcon, React.ReactNode> = {
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" />
      <path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9" />
      <path d="M4.5 14.5v3.3a1.7 1.7 0 0 0 1.7 1.7h11.6a1.7 1.7 0 0 0 1.7-1.7v-3.3" />
    </>
  ),
  paste: (
    <>
      <rect x="5.5" y="5" width="13" height="15.5" rx="2.2" />
      <path d="M9.2 5V4.3c0-.7.6-1.3 1.3-1.3h3c.7 0 1.3.6 1.3 1.3V5" />
      <path d="M9 11h6M9 14.5h4" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a3.6 3.6 0 0 0 5.1 0l3.2-3.2a3.6 3.6 0 0 0-5.1-5.1l-.9.9" />
      <path d="M14 10a3.6 3.6 0 0 0-5.1 0l-3.2 3.2a3.6 3.6 0 0 0 5.1 5.1l.9-.9" />
    </>
  ),
  frame: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
      <rect x="7" y="8" width="10" height="8" rx=".8" />
    </>
  ),
};

/** 끝난 칸의 ✓ — "초안이 왔어요" 줄도 같은 모양을 쓴다. */
export function StepCheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

const RING: Record<JourneyState, React.CSSProperties> = {
  todo: { background: "var(--bg)", boxShadow: "inset 0 0 0 1.5px var(--border-bright)", color: "var(--text-muted)" },
  now: { background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--text-primary)", color: "var(--text-primary)" },
  wait: { background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--text-primary)", color: "var(--text-primary)" },
  done: { background: "var(--text-primary)", color: "var(--bg)" },
  err: { background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--danger)", color: "var(--danger)" },
};
const INK: Record<JourneyState, React.CSSProperties> = {
  todo: { color: "var(--text-muted)" },
  now: { color: "var(--text-primary)", fontWeight: 700 },
  wait: { color: "var(--text-primary)", fontWeight: 700 },
  done: { color: "var(--text-secondary)" },
  err: { color: "var(--danger)", fontWeight: 700 },
};

export function JourneyStrip({ label, steps }: { label: string; steps: JourneyStep[] }) {
  return (
    <div className="relative self-center w-full" style={{ maxWidth: 456, marginTop: 2 }}>
      {/* 이음선 — 칸 가운데에서 다음 칸 가운데까지. 원(z 1)이 그 위를 덮는다. */}
      {steps.slice(0, -1).map((step, k) => (
        <span
          key={k}
          aria-hidden="true"
          className="absolute"
          style={{
            top: 17, left: `${(100 / steps.length) * (k + 0.5)}%`, width: `${100 / steps.length}%`,
            borderTop: step.state === "done" ? "1.5px solid var(--text-primary)" : "1.5px dotted var(--border-bright)",
          }}
        />
      ))}
      <ol aria-label={label} className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, margin: 0, padding: 0, listStyle: "none" }}>
        {steps.map((step, i) => (
          <li
            key={i}
            aria-current={step.state === "now" || step.state === "wait" ? "step" : undefined}
            className="flex flex-col items-center text-center"
            style={{ gap: 8 }}
          >
            <span className="relative block shrink-0" style={{ width: 36, height: 36, zIndex: 1 }}>
              {step.state === "wait" && (
                <span aria-hidden="true" className="absolute rounded-full animate-pulse motion-reduce:animate-none" style={{ inset: -6, background: "var(--blue-tint-strong)" }} />
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-full" style={RING[step.state]}>
                {step.state === "done" ? (
                  <StepCheckIcon />
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICON_PATHS[step.icon]}
                  </svg>
                )}
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", lineHeight: 1.3, ...INK[step.state] }}>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
