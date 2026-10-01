import { AiToolLogo } from "./helpers";

// 작품 고치기 창 맨 위 '미리보기'(2026-10-01 덜어내기 · 업그레이드안). 방문자 명함에 찍힐 이름·설명·
// 한 마디(+ 첫 AI 도구)를 고치는 대로 바로 보여 준다 — 저장 전 폼 값을 그대로 받아 그리므로 자기 상태가 없다.
//
// 카드는 초안 검토 창의 명함 렌더(DraftReviewModal)와 같은 어두운 바탕을 작게 줄인 것이고, 글자 규칙은
// 실제 명함(TheaterStage)을 따른다: 설명은 줄바꿈을 살려 3줄에서 끊고, 비어 있는 칸은 그리지 않는다.
// 명함은 작품 위에 뜨는 흰 글씨라 테마와 무관하게 어둡다 — 카드 안 색만 고정값이고 바깥 띠·이름표는 테마 변수.
//
// 띠는 수정 창의 스크롤 칸 안에 있다(창 머리 아래 고정이 아님) — 낮은 노트북 화면에서도 아래 버튼 줄을
// 밀어내지 않는다. 바로 아래 칸들과 같은 글의 되풀이라 화면 낭독기에선 숨긴다.

const CARD_BG = "linear-gradient(180deg, #2a241f 0%, #1a1612 100%)";

function clamp(lines: number): React.CSSProperties {
  return { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" };
}

export function WorkCardPreview({ label, title, untitled, description, comment, tool }: {
  label: string;
  title: string;
  untitled: string;
  description: string;
  comment: string;
  tool?: string;
}) {
  return (
    // 좁은 창(폰)에선 카드가 띠 너비를 거의 다 써서 '미리보기' 이름표가 카드 모서리에 얹힌다 — 그때만 카드를 아래로.
    <div aria-hidden="true" className="relative flex justify-center px-6 pt-11 pb-[18px] sm:pt-4"
      style={{
        borderBottom: "1px solid var(--border)",
        background: "radial-gradient(46% 100% at 50% 0%, color-mix(in srgb, var(--surface) 85%, transparent), transparent),"
          + " linear-gradient(180deg, var(--surface-soft), var(--surface-soft-hover))",
      }}>
      <span style={{
        position: "absolute", left: 14, top: 14, padding: "2px 10px", borderRadius: 999,
        background: "color-mix(in srgb, var(--surface) 75%, transparent)", boxShadow: "0 0 0 1px var(--border)",
        color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 600, lineHeight: 1.5,
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>

      <div style={{
        width: 336, maxWidth: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
        padding: "14px 16px 13px", borderRadius: 16, background: CARD_BG,
        // 바깥 1px 옅은 흰 테두리: 밝은 띠에선 안 보이고, 다크의 어두운 띠에선 카드 가장자리를 세운다.
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(255,255,255,0.05), var(--shadow-card-small)",
        wordBreak: "keep-all", overflowWrap: "anywhere",
      }}>
        <p className="vf-serif-display" style={{
          margin: 0, maxWidth: "100%", fontSize: 17, fontWeight: 600, lineHeight: 1.3,
          color: title ? "#fff" : "rgba(255,255,255,0.4)", ...clamp(2),
        }}>
          {title || untitled}
        </p>
        {description && (
          <p style={{
            margin: 0, maxWidth: "100%", fontFamily: "var(--font-nunito)", fontSize: 12, lineHeight: 1.5,
            color: "rgba(255,255,255,0.84)", whiteSpace: "pre-line", ...clamp(3),
          }}>
            {description}
          </p>
        )}
        {comment && (
          <p style={{
            margin: "2px 0 0", maxWidth: "100%", padding: "4px 10px", borderRadius: 13,
            background: "rgba(255,255,255,0.12)", color: "#fff",
            fontFamily: "var(--font-nunito)", fontSize: 12, fontWeight: 500, lineHeight: 1.5, ...clamp(2),
          }}>
            {comment}
          </p>
        )}
        {tool && (
          <span className="inline-flex items-center gap-1" style={{
            maxWidth: "100%", padding: "2px 8px", borderRadius: 999,
            background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.88)",
            fontFamily: "var(--font-nunito)", fontSize: 11, lineHeight: 1.5,
          }}>
            <AiToolLogo id={tool} size={11} />
            <span className="truncate">{tool}</span>
          </span>
        )}
      </div>
    </div>
  );
}
