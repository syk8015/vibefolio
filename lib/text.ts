/** 여러 줄 텍스트를 한 줄로 눕힌다(줄바꿈·연속 공백 → 공백 하나).
 *
 * 작품 설명(description)은 화면에서 일부러 3줄로 끊어 쓰는 카피라 줄바꿈을 품는다
 * (components/theater/TheaterStage.tsx는 white-space: pre-line으로 그대로 살린다).
 * 하지만 meta description·OG·JSON-LD는 "문장 하나"를 기대하는 자리다 — 날 줄바꿈이
 * 그대로 나가면 수집기마다 다르게 렌더된다. 사람이 보는 화면은 줄을 살리고,
 * 기계가 읽는 자리에서만 이걸 통과시킨다. */
export function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").replace(/[ \t]{2,}/g, " ").trim();
}
