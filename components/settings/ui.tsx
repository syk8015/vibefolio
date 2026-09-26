// 설정 화면(/settings)의 공통 부품 — 칸 이름표 · 채움 목록 · 한 줄(토스 ListRow: 아이콘 · 이름/설명 ·
// 오른쪽 조작). 시안=claude.ai/artifact/JG1rHep7VpWvfWbBBJo6og(09-26 사용자 확정). 글자 크기는
// 연결 창 규칙: 15 이름 · 14 설명·버튼 · 13 한 줄 설명.

// 줄 사이 구분 — soft 채움 위에 바탕색 1px(테두리 색은 다크에서 채움과 거의 같아 안 보였다).
export const DIVIDER: React.CSSProperties = { borderTop: "1px solid var(--bg)" };

// 조작 버튼 — soft 목록 위라 한 단계 진한 채움(--surface-active). 14px = 창 안 보조 버튼.
export function pillStyle(locked = false): React.CSSProperties {
  return {
    fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.4, padding: "0.4rem 0.95rem",
    borderRadius: 999, border: "none", background: "var(--surface-active)", color: "var(--text-primary)",
    fontFamily: "var(--font-nunito)", whiteSpace: "nowrap", flexShrink: 0,
    opacity: locked ? 0.5 : 1, cursor: locked ? "not-allowed" : "pointer",
  };
}

export const TEXT: React.CSSProperties = { fontFamily: "var(--font-nunito)", lineHeight: 1.6 };

/** 칸 하나 — 이름표 + (설명) + 내용. */
export function Section({ label, intro, children }: {
  label: string; intro?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="vf-label">{label}</h2>
      {intro && <p className="text-sm mb-3" style={{ ...TEXT, color: "var(--text-secondary)" }}>{intro}</p>}
      {children}
    </section>
  );
}

/** 채움 목록 — 줄은 Row. */
export function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="rounded-2xl overflow-hidden" style={{ background: "var(--surface-soft)" }}>
      {children}
    </ul>
  );
}

export function Row({ icon, name, detail, action, divider = false, children }: {
  icon?: React.ReactNode; name: string; detail?: React.ReactNode; action?: React.ReactNode;
  divider?: boolean; children?: React.ReactNode;
}) {
  return (
    <li className="px-4 py-3.5" style={divider ? DIVIDER : undefined}>
      <div className="flex items-center gap-3">
        {icon && <span className="shrink-0 w-5 flex justify-center" style={{ color: "var(--text-primary)" }}>{icon}</span>}
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.4, color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            {name}
          </p>
          {detail && (
            <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", overflowWrap: "anywhere" }}>
              {detail}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </li>
  );
}

/** 줄 안에서 펼치는 확인 — 되돌릴 수 있는 일은 창을 띄우지 않는다. indent = 아이콘 있는 줄의 글자 선에 맞춘다. */
export function InlineConfirm({ text, yes, no, onYes, onNo, locked, indent = false }: {
  text: string; yes: string; no: string; onYes: () => void; onNo: () => void; locked: boolean; indent?: boolean;
}) {
  return (
    <div className={`mt-3 flex flex-col gap-2.5${indent ? " pl-8" : ""}`}>
      <p className="text-sm" style={{ ...TEXT, color: "var(--text-secondary)" }}>{text}</p>
      <div className="flex items-center gap-4">
        <button type="button" onClick={onYes} disabled={locked} style={pillStyle(locked)}>{yes}</button>
        <button type="button" className="vf-button-text" disabled={locked} onClick={onNo}>{no}</button>
      </div>
    </div>
  );
}
