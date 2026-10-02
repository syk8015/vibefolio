// 소개 영상이 놓이는 표면마다 "글자를 두면 가려지는 곳"(영상 좌표 1600×900 기준).
// 명함 무대: 왼쪽 아래에 제목·설명·버튼이 얹히고, 16:10 무대라 양옆이 잘린다(10-01 실서버에서 본 겹침·잘림).
export type IntroSurface = "card" | "watch";
export type Zone = { x: number; y: number; w: number; h: number; why: string };

export const SAFE_ZONES: Record<IntroSurface, Zone[]> = {
  card: [
    { x: 0, y: 0, w: 80, h: 900, why: "16:10 crop (left)" },
    { x: 1520, y: 0, w: 80, h: 900, why: "16:10 crop (right)" },
    { x: 80, y: 600, w: 820, h: 270, why: "title plate" },
    { x: 1110, y: 640, w: 420, h: 120, why: "maker's note bubble" },
  ],
  watch: [],
};
