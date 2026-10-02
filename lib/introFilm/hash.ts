// 대본 지문 — 워커가 만든 영상 파일이 지금 대본과 같은지 가른다(스타일·글자를 고치면 지문이 바뀌어 다시 만든다).
// 서버 전용(node:crypto). 키 순서가 달라도 같은 지문이 나오게 정렬해서 잰다.
import { createHash } from "node:crypto";

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** 틀 판이 바뀌면(그림 방식이 달라지면) 이 값을 올려 모든 영상을 다시 만들게 한다. */
export const INTRO_TEMPLATE_VERSION = 4; // 2 = 10-02 품질 다듬기(빈 화면·두 줄·흐름 장면·한글 간격), 3 = 끊김 고치기(카메라 곡선·흐림·60fps), 4 = 10-03 모션그래픽 9가지(산호색 점·계기판·굴러가는 숫자·파고들기·손그림·신호·색 판·터지는 끝)

export function introFilmHash(film: unknown): string {
  return createHash("sha256").update(`v${INTRO_TEMPLATE_VERSION}:${canonical(film)}`).digest("hex").slice(0, 24);
}
