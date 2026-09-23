"use client";

// 접힌 줄 — "원할 때만 보여준다"(2026-09-23 브랜드 철학)의 기본 부품. 이유·세부·다른 방법은
// 이 줄 뒤에 접어 두고, 누른 사람에게만 펼친다. 되돌릴 수 없는 일·공개 범위·실패는 여기에
// 숨기지 않는다(늘 보이는 예외).
export function FoldToggle({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        color: "var(--text-muted)", fontFamily: "var(--font-nunito)",
        fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
        background: "none", border: "none", padding: 0, textAlign: "left",
        display: "inline-flex", alignItems: "center", gap: 5,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"
        style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </button>
  );
}
