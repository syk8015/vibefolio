// postprocess.ts의 축소판 — 홍보 클립은 카메라 무브(zoompan)가 없는 고정
// 샷 하나뿐이라, raw를 목표 해상도로 스케일한 뒤(body) 검증된 로고 엔드캡
// (promo-endcap.ts, local-runner/endcap.ts 로직 재사용)을 이어붙인다. body와
// endcap을 같은 encodeArgs로 인코딩해 무손실 concat — 재인코딩 두 번 없음.
import { FPS } from "./config";
import { run, ffprobeValue } from "./util";
import { renderPromoEndcap, concatWithEndcap } from "./promo-endcap";

export type PromoPostInput = {
  rawPath: string;
  outPath: string;
  outW: number;
  outH: number;
  outDir: string;
};

export type PromoPostResult = {
  durationSec: number;
  posterPath?: string;
};

// 짧은 세로/가로 클립이라 720p 데모보다 살짝 여유 있게. 무음(타이핑 사운드 없음).
const ENCODE_ARGS = [
  "-r", String(FPS),
  "-fps_mode", "cfr",
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "23",
  "-pix_fmt", "yuv420p",
  "-an",
];

export async function promoPostprocess(input: PromoPostInput): Promise<PromoPostResult> {
  const { rawPath, outPath, outW, outH, outDir } = input;
  const rawDuration = await ffprobeValue(rawPath, "format=duration");
  if (!rawDuration || rawDuration < 1) {
    throw new Error(`raw duration unreadable (${rawDuration}) — capture is likely corrupt`);
  }

  // body — 스케일 + 페이드인만. 페이드아웃은 없다: 엔드캡이 바로 이어붙으므로
  // body가 갑자기 사라지면 이상하고, 지우기 끝난 빈 화면 그대로 로고 씬으로
  // 넘어가는 게 자연스럽다(둘 다 같은 solid 배경).
  const bodyPath = `${outDir}/promo-body.mp4`;
  const bodyRes = await run(
    "ffmpeg",
    [
      "-y",
      "-i", rawPath,
      "-vf", `scale=${outW}:${outH}:flags=lanczos,fade=t=in:st=0:d=0.25,format=yuv420p`,
      ...ENCODE_ARGS,
      "-movflags", "+faststart",
      bodyPath,
    ],
    { timeoutMs: 120_000 },
  );
  if (bodyRes.code !== 0) {
    throw new Error(`ffmpeg promo body failed (exit ${bodyRes.code}): ${bodyRes.stderr.slice(-600)}`);
  }

  // 포스터(best-effort) — 타이핑이 진행된 중반 프레임이 빈 헤드라인 첫
  // 프레임보다 미리보기용으로 낫다.
  let posterPath: string | undefined;
  try {
    const p = `${outDir}/promo-poster.jpg`;
    const ss = Math.max(0.5, rawDuration * 0.4).toFixed(2);
    const shot = await run(
      "ffmpeg",
      ["-y", "-ss", ss, "-i", bodyPath, "-frames:v", "1", "-q:v", "3", p],
      { timeoutMs: 30_000 },
    );
    if (shot.code !== 0) throw new Error(shot.stderr.slice(-300));
    posterPath = p;
  } catch (e) {
    console.error("[promo-postprocess] poster extraction failed (non-fatal):", (e as Error).message);
  }

  // 로고 엔드캡 렌더 + concat.
  const endcapPath = `${outDir}/promo-endcap.mp4`;
  const { durationSec: endcapDur } = await renderPromoEndcap({
    outPath: endcapPath,
    width: outW,
    height: outH,
    fps: FPS,
    outDir,
    encodeArgs: ENCODE_ARGS,
  });
  await concatWithEndcap(bodyPath, endcapPath, outPath, outDir);

  return { durationSec: rawDuration + endcapDur, posterPath };
}
