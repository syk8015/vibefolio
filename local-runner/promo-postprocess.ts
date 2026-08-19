// postprocess.ts의 축소판 — 홍보 클립은 카메라 무브(zoompan)가 없는 고정
// 샷 하나뿐이라, raw를 목표 해상도로 스케일한 뒤(body) 검증된 로고 엔드캡
// (promo-endcap.ts, local-runner/endcap.ts 로직 재사용)을 이어붙인다. body와
// endcap을 같은 encodeArgs로 인코딩해 무손실 concat — 재인코딩 두 번 없음.
import { readFileSync } from "node:fs";
import { FPS } from "./config";
import { run, ffprobeValue } from "./util";
import { renderPromoEndcap, concatWithEndcap } from "./promo-endcap";

export type PromoPostInput = {
  rawPath: string;
  outPath: string;
  outW: number;
  outH: number;
  outDir: string;
  // 헤드리스 녹화는 컨텍스트 생성 시점부터 녹화되므로 네비게이션·마운트
  // 구간이 앞에 붙는다(promo-record.ts가 첫 글자 시점으로 계산해 넘긴다).
  trimHeadSec?: number;
  // 이 시각(원본 기준 초)에서 끊는다 — 그 뒤는 Playwright가 채워 넣은 정지
  // 프레임이라 커서가 얼어붙는다.
  trimTailAtSec?: number;
  // 앞부분 페이드인 길이(초). 0이면 안 넣는다 — opening=hook은 첫 프레임부터
  // 문구가 보여야 해서 페이드가 훅을 가린다.
  fadeInSec?: number;
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

// 좌상단 구석 한 점의 색(본편은 항상 단색 배경 위 중앙 텍스트라 구석은 배경).
// util.run은 stdout을 문자열로 모으므로 바이너리를 파이프로 못 받는다 →
// 1×1 rawvideo를 파일로 뽑아 3바이트를 직접 읽는다.
async function sampleBackgroundHex(path: string, atSec: number, outDir: string): Promise<string | undefined> {
  try {
    const px = `${outDir}/promo-bg.raw`;
    const r = await run(
      "ffmpeg",
      ["-y", "-v", "error", "-ss", atSec.toFixed(2), "-i", path, "-frames:v", "1",
       "-vf", "crop=64:64:24:24,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", px],
      { timeoutMs: 30_000 },
    );
    if (r.code !== 0) return undefined;
    const buf = readFileSync(px);
    if (buf.length < 3) return undefined;
    return `#${buf.subarray(0, 3).toString("hex")}`;
  } catch {
    return undefined;
  }
}

export async function promoPostprocess(input: PromoPostInput): Promise<PromoPostResult> {
  const { rawPath, outPath, outW, outH, outDir } = input;
  const rawDuration = await ffprobeValue(rawPath, "format=duration");
  if (!rawDuration || rawDuration < 1) {
    throw new Error(`raw duration unreadable (${rawDuration}) — capture is likely corrupt`);
  }
  // 앞부분 트림은 -ss(출력측)가 아니라 필터 그래프의 trim+setpts로 한다 —
  // fade의 st=0이 트림 후 타임라인 기준이어야 하고, VP8은 키프레임이 성겨서
  // 입력측 -ss가 프레임 단위로 안 맞는다.
  const trimHead = Math.max(0, Math.min(input.trimHeadSec ?? 0, rawDuration - 1));
  const trimTail =
    input.trimTailAtSec && input.trimTailAtSec > trimHead + 0.5
      ? Math.min(input.trimTailAtSec, rawDuration)
      : rawDuration;
  const bodyDuration = trimTail - trimHead;
  const trimFilter =
    trimHead > 0.01 || trimTail < rawDuration - 0.01
      ? `trim=start=${trimHead.toFixed(3)}:end=${trimTail.toFixed(3)},setpts=PTS-STARTPTS,`
      : "";

  // body — 스케일 + (opening=full일 때만) 페이드인.
  //  - hook에서 페이드를 빼는 이유: 첫 프레임부터 문구가 보이게 앞을 잘라놨는데
  //    검은 화면에서 밝아지는 0.25초가 그 훅을 도로 가린다.
  //  - 페이드아웃은 어느 쪽이든 없다: 엔드캡이 바로 이어붙으므로 body가
  //    사라지면 이상하다.
  const fadeIn = input.fadeInSec ?? 0;
  const fadeFilter = fadeIn > 0 ? `,fade=t=in:st=0:d=${fadeIn.toFixed(2)}` : "";
  const bodyPath = `${outDir}/promo-body.mp4`;
  const bodyRes = await run(
    "ffmpeg",
    [
      "-y",
      "-i", rawPath,
      "-vf", `${trimFilter}scale=${outW}:${outH}:flags=lanczos${fadeFilter},format=yuv420p`,
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
    const ss = Math.max(0.5, bodyDuration * 0.4).toFixed(2);
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

  // 본편이 실제로 어떤 배경색으로 인코딩됐는지 한 픽셀 재서 엔드캡에 넘긴다 —
  // 컷 없이 바로 이어붙기 때문에 두 배경이 정확히 같아야 이음매가 안 보인다.
  const bg = await sampleBackgroundHex(bodyPath, Math.max(0.5, bodyDuration * 0.6), outDir);

  // 로고 엔드캡 렌더 + concat.
  const endcapPath = `${outDir}/promo-endcap.mp4`;
  const { durationSec: endcapDur } = await renderPromoEndcap({
    outPath: endcapPath,
    width: outW,
    height: outH,
    fps: FPS,
    outDir,
    encodeArgs: ENCODE_ARGS,
    bg,
  });
  await concatWithEndcap(bodyPath, endcapPath, outPath, outDir);

  return { durationSec: bodyDuration + endcapDur, posterPath };
}
