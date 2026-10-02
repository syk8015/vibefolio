// 주인이 올린 영상 줄이기(2026-10-02) — 서버 라우트(app/api/worker/video)와 맥 워커(local-runner/video-transcode.ts)가
// 같은 규칙을 쓴다. 순수 함수만(네트워크·파일 없음, npm test의 probe-video-transcode-unit).

/** 줄인 파일 이름 끝 — 이게 붙은 주소는 다시 집지 않는다(새 칸 없이 "이미 줄였나"를 안다). */
export const TRANSCODED_SUFFIX = "-nf.mp4";

/** 대시보드·인제스트가 받는 영상 확장자(app/api/storage/sign VIDEO_EXT와 같다). */
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v"]);

export function isTranscodable(path: string): boolean {
  if (path.endsWith(TRANSCODED_SUFFIX)) return false;
  const ext = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXT.has(ext);
}

/** 긴 변 1920 안으로(세로 영상도), 크기는 짝수. 화질 CRF 24 — 소개 영상 파일과 같은 값. 소리는 있으면 AAC로. */
export function transcodeArgs(input: string, output: string): string[] {
  return [
    "-y", "-hide_banner", "-loglevel", "error", "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))':flags=lanczos,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart", output,
  ];
}

/** 원본이 mp4일 때 다시 누르지 않고 상자만 바꾸기(앞부분에 목차 → 바로 재생). */
export function remuxArgs(input: string, output: string): string[] {
  return ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-map", "0", "-c", "copy", "-movflags", "+faststart", output];
}

/**
 * 무엇을 올리나. 다시 누른 게 원본의 90% 이상이면 줄인 보람이 없다 — mp4 원본은 상자만 바꾼 것(같은 화질),
 * 다른 상자(mov·webm)는 그래도 다시 누른 것(브라우저가 mp4를 가장 잘 튼다).
 */
export function pickOutput(srcExt: string, srcBytes: number, encodedBytes: number): "encoded" | "remux" {
  if (encodedBytes < srcBytes * 0.9) return "encoded";
  return ["mp4", "m4v"].includes(srcExt.toLowerCase()) ? "remux" : "encoded";
}
