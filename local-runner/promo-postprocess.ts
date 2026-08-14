// postprocess.ts의 축소판 — 홍보 클립은 카메라 무브(zoompan)도 엔드캡도 없는
// 고정 샷 하나뿐이라, 목표 해상도로 스케일 + 페이드인/아웃 한 패스와 포스터
// 추출만 하면 된다. (postprocess.ts를 그대로 재사용하지 않는 이유: 그쪽은
// CameraEvent[]와 username 문자열에 결합되어 있어 이 용도엔 과함.)
import { FPS } from "./config";
import { run, ffprobeValue } from "./util";

export type PromoPostInput = {
  rawPath: string;
  outPath: string;
  outW: number;
  outH: number;
};

export type PromoPostResult = {
  durationSec: number;
  posterPath?: string;
};

// postprocess.ts와 동일한 libx264 인코드 파라미터(음소거 — 타이핑 사운드 없음).
const ENCODE_ARGS = [
  "-r", String(FPS),
  "-fps_mode", "cfr",
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "23", // 짧은 세로 클립이라 720p 데모보다 살짝 여유 있게
  "-pix_fmt", "yuv420p",
  "-an",
];

export async function promoPostprocess(input: PromoPostInput): Promise<PromoPostResult> {
  const { rawPath, outPath, outW, outH } = input;
  const durationSec = await ffprobeValue(rawPath, "format=duration");
  if (!durationSec || durationSec < 1) {
    throw new Error(`raw duration unreadable (${durationSec}) — capture is likely corrupt`);
  }
  const fadeOutStart = Math.max(0, durationSec - 0.4).toFixed(2);

  const { code, stderr } = await run(
    "ffmpeg",
    [
      "-y",
      "-i", rawPath,
      "-vf",
      `scale=${outW}:${outH}:flags=lanczos,` +
        `fade=t=in:st=0:d=0.25,fade=t=out:st=${fadeOutStart}:d=0.4,format=yuv420p`,
      ...ENCODE_ARGS,
      "-movflags", "+faststart",
      outPath,
    ],
    { timeoutMs: 120_000 },
  );
  if (code !== 0) {
    throw new Error(`ffmpeg promo-postprocess failed (exit ${code}): ${stderr.slice(-600)}`);
  }

  // 포스터(best-effort) — 타이핑이 어느 정도 진행된 중반 프레임이 빈 헤드라인
  // 첫 프레임보다 미리보기용으로 낫다.
  let posterPath: string | undefined;
  try {
    const p = outPath.replace(/\.mp4$/, "-poster.jpg");
    const ss = Math.max(0.5, durationSec * 0.4).toFixed(2);
    const shot = await run(
      "ffmpeg",
      ["-y", "-ss", ss, "-i", outPath, "-frames:v", "1", "-q:v", "3", p],
      { timeoutMs: 30_000 },
    );
    if (shot.code !== 0) throw new Error(shot.stderr.slice(-300));
    posterPath = p;
  } catch (e) {
    console.error("[promo-postprocess] poster extraction failed (non-fatal):", (e as Error).message);
  }

  return { durationSec, posterPath };
}
