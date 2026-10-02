import { useT } from "@/lib/i18n/client";
import { StageChip } from "@/components/theater/StageMarks";

// 작품 고치기 창 맨 위 '미리보기'(2026-10-01 덜어내기 · 업그레이드안). 방문자 프레임에 찍힐 이름·설명·
// 한 마디(+ 첫 AI 도구)를 고치는 대로 바로 보여 준다 — 저장 전 폼 값을 그대로 받아 그리므로 자기 상태가 없다.
//
// 2026-10-02 덜어내기 2차: 모양은 새 공개 프레임 페이지(TheaterStage 무대 + StageCaption 이름표)를 작게 줄인
// 것이다 — 우리 글을 더는 어두운 카드 위 흰 글씨로 얹지 않는다. 위에 짧은 어두운 무대 띠(바닥에 꾸밈용 재생
// 막대), 그 밑 페이지 바탕(--bg)에 이름표: 세리프 제목 · 줄바꿈을 풀어 흘린 설명(둘 다 2줄에서 자른다) ·
// 흐린 한 줄(AI 도구) · 한 마디는 '만든이 메모' 흰 말풍선. 비어 있는 칸은 그리지 않는다.
// 무대 띠만 테마와 무관하게 어둡고(작품 화면 자리) 나머지는 전부 테마 변수다.
//
// 무대 띠·말풍선·이름표 글 모양(MiniStage·NoteBubble·captionText·MiniWork)은 초안 검토 창
// (DraftReviewModal)의 방문자 미리보기도 같이 쓴다 — 둘이 같은 프레임을 그리도록 한 벌만 둔다.
//
// 띠는 수정 창의 스크롤 칸 안에 있다(창 머리 아래 고정이 아님) — 낮은 노트북 화면에서도 아래 버튼 줄을
// 밀어내지 않는다. 바로 아래 칸들과 같은 글의 되풀이라 화면 낭독기에선 숨긴다.

// 무대 띠 바탕 — 대시보드 미리보기가 써 온 어두운 그라데이션. 작품 화면 자리라 테마와 무관하게 어둡다.
const STAGE_BG = "linear-gradient(180deg, #2a241f 0%, #1a1612 100%)";

function clampLines(lines: number): React.CSSProperties {
  return { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" };
}

// 이름표 글 모양 — 공개 프레임 StageCaption의 규칙 그대로, 글자 크기만 받는다.
// 제목은 세리프 2줄, 설명은 줄바꿈을 풀어(기본 white-space) 2줄, 흐린 한 줄은 한 줄에서 말줄임.
export const captionText = {
  title: (fontSize: number | string): React.CSSProperties => ({
    margin: 0, fontSize, fontWeight: 600, lineHeight: 1.2, ...clampLines(2),
  }),
  description: (fontSize: number): React.CSSProperties => ({
    margin: 0, maxWidth: 600, fontFamily: "var(--font-nunito)", fontSize, lineHeight: 1.55,
    color: "var(--text-secondary)", wordBreak: "keep-all", textWrap: "balance", ...clampLines(2),
  }),
  meta: (fontSize: number): React.CSSProperties => ({
    margin: 0, fontFamily: "var(--font-nunito)", fontSize, lineHeight: 1.5, color: "var(--text-muted)",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  }),
};

// 짧은 무대 띠 — 프레임 무대를 작게. 왼쪽 위 표시는 무대와 같은 StageChip(글이 있을 때만), 바닥엔 3px 재생 막대.
// 막대는 영상 시간이 아니라 꾸밈(35%에 멈춘 그림)이라 움직이지 않는다.
// isolation — StageChip의 z-index가 띠 밖(창 머리·⋯ 메뉴·버튼 줄 흐림)을 넘지 않게 띠 안에 가둔다.
export function MiniStage({ height, label, radius = 10 }: { height: number; label?: string | null; radius?: number }) {
  return (
    <div
      style={{
        position: "relative", isolation: "isolate", height, borderRadius: radius, overflow: "hidden", background: STAGE_BG,
        // 안쪽 옅은 테두리: 다크에선 페이지 바탕(--bg)과 띠 아래쪽이 같은 색이라 가장자리를 세운다.
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06), 0 6px 16px -8px rgba(0,0,0,0.35)",
      }}
    >
      {label ? <StageChip label={label} inset={10} /> : null}
      <span
        aria-hidden
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: 3,
          background: "linear-gradient(rgba(255,255,255,0.16), rgba(255,255,255,0.16)), rgba(0,0,0,0.28)",
        }}
      >
        <span style={{ display: "block", width: "35%", height: "100%", background: "#f4ede0" }} />
      </span>
    </div>
  );
}

// 한 마디 말풍선 — 프레임 페이지의 '만든이 메모'(TheaterStage MakerNote)와 같은 흰 말풍선 · 왼쪽 작은 꼬리 ·
// 작은 이름표 · 글 2줄. md = 초안 검토 창(공개 페이지와 같은 크기), sm = 작은 미리보기.
// muted = 빈 한 마디 자리(검토 창에서 눌러 채우는 자리표시).
export function NoteBubble({ label, size = "sm", muted = false, children, style, ...rest }: {
  label: string;
  size?: "sm" | "md";
  muted?: boolean;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  const md = size === "md";
  return (
    <div
      {...rest}
      style={{
        // 칸보다 넓어지지 않게(flex: none으로 놓여도) — 공개 페이지는 바깥 덩어리의 maxWidth 100%가 맡는다.
        position: "relative", maxWidth: md ? "min(300px, 100%)" : "min(232px, 100%)", padding: md ? "9px 14px 10px" : "7px 11px 8px",
        background: "var(--surface)", borderRadius: md ? 12 : 10, boxShadow: "var(--shadow-card-small)",
        fontFamily: "var(--font-nunito)", wordBreak: "keep-all", textAlign: "left",
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute", left: md ? -5 : -4, top: md ? 19 : 15, width: md ? 11 : 9, height: md ? 11 : 9,
          borderRadius: 2, background: "var(--surface)", transform: "rotate(45deg)",
          boxShadow: "-2px 2px 3px rgba(0,0,0,0.05)",
        }}
      />
      <span
        style={{
          position: "relative", display: "block", marginBottom: md ? 2 : 1,
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em",
          textTransform: "uppercase", color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          position: "relative", fontSize: md ? 14 : 12.5, fontWeight: 600, lineHeight: 1.45,
          color: muted ? "var(--text-muted)" : "var(--text-primary)", ...clampLines(2),
        }}
      >
        {children}
      </span>
    </div>
  );
}

// 작은 프레임 한 장(이 창의 미리보기 · 검토 창의 '공개했어요') — 무대 띠 + 이름표. 왼쪽 글 칸 옆 말풍선은
// 공개 페이지처럼 칸이 좁으면 글 밑 오른쪽으로 내려간다(이 크기에선 늘 내려간다). 빈 글은 그리지 않는다.
export function MiniWork({ title, untitled, description, meta, note, noteLabel }: {
  title: string;
  untitled: string;
  description: string;
  /** 흐린 한 줄 — "AI 도구 · 연도"(공개 페이지와 같은 순서). 비면 줄을 두지 않는다 */
  meta: string;
  note: string;
  noteLabel: string;
}) {
  return (
    <>
      <MiniStage height={44} radius={9} />
      <div className="flex flex-wrap items-start" style={{ columnGap: 16, rowGap: 8, marginTop: 10 }}>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <p className="vf-serif-display" style={{ ...captionText.title(17), color: title ? undefined : "var(--text-muted)" }}>
            {title || untitled}
          </p>
          {description && <p style={{ ...captionText.description(12.5), marginTop: 3 }}>{description}</p>}
          {meta && <p style={{ ...captionText.meta(11.5), marginTop: 4 }}>{meta}</p>}
        </div>
        {note && <NoteBubble label={noteLabel} style={{ flex: "none", marginLeft: "auto" }}>{note}</NoteBubble>}
      </div>
    </>
  );
}

export function WorkCardPreview({ label, title, untitled, description, comment, tool }: {
  label: string;
  title: string;
  untitled: string;
  description: string;
  comment: string;
  tool?: string;
}) {
  const { t } = useT();
  return (
    // 좁은 창(폰)에선 작은 프레임이 띠 너비를 거의 다 써서 '미리보기' 이름표가 그 모서리에 얹힌다 — 그때만 아래로.
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

      {/* 작은 페이지 한 장 — 프레임 페이지 바탕(--bg) 위에 무대 띠와 이름표 */}
      <div style={{
        width: 352, maxWidth: "100%", padding: "8px 8px 10px", borderRadius: 14, background: "var(--bg)",
        boxShadow: "0 0 0 1px var(--border), var(--shadow-panel)",
        wordBreak: "keep-all", overflowWrap: "anywhere",
      }}>
        <MiniWork title={title} untitled={untitled} description={description} meta={tool ?? ""}
          note={comment} noteLabel={t.theater.makerNote} />
      </div>
    </div>
  );
}
