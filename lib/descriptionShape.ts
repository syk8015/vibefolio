// 소개글 "모양" 규칙 — 서버 게이트(app/api/ingest)와 대시보드 인라인 편집이
// **같은 판정**을 쓰도록 순수 모듈로 둔다(2026-09-04, next/server 의존 없음).
// 서버가 거절할 글을 화면이 저장하게 두면, 사람이 고친 게 발행에서 튕긴다.
//
// 소개글은 명함에서 작품 위에 겹쳐 뜨는 첫인상 글이라 "몇 자냐"보다 "몇 줄이고
// 한 줄이 얼마나 기냐"가 실제 화면을 결정한다. 한글은 화면에서 두 칸을 먹으므로
// 글자 수가 아니라 칸 수로 잰다. 폰 명함(폭 280px·12px)에서 한 줄 ≈ 46칸 —
// 52칸을 넘는 줄은 무조건 접히고, 명함은 3줄까지만 그린다.

export const DESCRIPTION_MAX = 200;
export const DESCRIPTION_MIN_LINES = 2;
export const DESCRIPTION_MAX_LINES = 3;
export const DESCRIPTION_LINE_COLS_MAX = 52;

export function lineCols(line: string): number {
  let w = 0;
  for (const ch of line) {
    const c = ch.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) || c >= 0x1f300;
    w += wide ? 2 : 1;
  }
  return w;
}

export const descriptionTooLong = (v: string) => [...v].length > DESCRIPTION_MAX;

export type DescriptionIssue =
  | { kind: "empty" }
  | { kind: "lines"; lines: number }
  | { kind: "long-line"; cols: number; line: number };

/** 3줄 카피 규격 위반이면 사유를, 통과면 null. 길이 상한(DESCRIPTION_MAX)과는 별개 검사. */
export function descriptionShapeIssue(v: string): DescriptionIssue | null {
  const lines = v.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { kind: "empty" };
  if (lines.length < DESCRIPTION_MIN_LINES || lines.length > DESCRIPTION_MAX_LINES) {
    return { kind: "lines", lines: lines.length };
  }
  for (let i = 0; i < lines.length; i++) {
    const cols = lineCols(lines[i]);
    if (cols > DESCRIPTION_LINE_COLS_MAX) return { kind: "long-line", cols, line: i + 1 };
  }
  return null;
}
