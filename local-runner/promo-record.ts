// 클립 1개의 촬영 오케스트레이션 — 순수 함수, DB 미접촉(claim/상태쓰기는
// promo-worker.ts 담당).
//
// ⚠️ 2026-08-18: 화면 캡처(avfoundation) → **헤드리스 브라우저 비디오 녹화**로
// 전환했다. 이유는 물리적 제약이다 — 이 맥의 논리 해상도는 1280×832라
// 세로(9:16) 포맷이 요구하는 540×960 뷰포트가 화면에 아예 안 들어간다(메뉴바·
// Dock·브라우저 크롬을 빼면 innerHeight 최대 ~748). ensureExactViewport가
// 수렴 실패로 fail-loud 하면서 세로 클립 전량이 실패했다. 화면 캡처는 디스플레이
// 크기가 상한이지만 헤드리스 녹화는 오프스크린 렌더라 상한이 없다.
//
// 부수 이득: 촬영 중 화면을 점유하지 않는다 → 방해금지·물리 커서 파킹·창
// frontmost·Dock 툴팁 같은 데모 파이프라인의 캡처 오염 방어가 전부 불필요해지고,
// 사용자가 맥을 쓰면서 배치를 돌릴 수 있다. 데모 파이프라인(local-runner/
// record.ts·browser.ts)은 손대지 않았다 — 거기는 실제 앱의 GPU 렌더·네이티브
// 드래그를 찍어야 해서 화면 캡처가 여전히 옳다.
//
// 트레이드오프: Playwright 비디오는 25fps VP8이라 후처리에서 60fps CFR로
// 늘린다(타이핑 텍스트라 체감 차이 없음). 엔드캡은 그대로 60fps 프레임 렌더.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { promoPostprocess } from "./promo-postprocess";
import { estimateTaglineRecordMs } from "../lib/promo";
import { uploadToR2 } from "../lib/r2";
import { PROMO_APP_URL, PROMO_FORMATS, PROMO_OUT_DIR, type PromoFormat } from "./config";
import { run } from "./util";

// 첫 페인트(흰→크림)를 찾을 때 쓰는 밝기 계단 임계값과 탐색 상한.
// 크림 배경은 흰 화면보다 YAVG가 ~11 낮게 잡힌다(2026-08-18 실측).
const FIRST_PAINT_DROP = 4;
// 문구가 다 지워진 뒤 남길 여운. 헤드라인이 다음 사이클을 시작하는 420ms보다
// 확실히 짧아야 한다(길면 다음 문구 첫 글자가 클립 끝에 찍힌다).
const ERASED_TAIL_MS = 250;
const FIRST_PAINT_MAX_SEC = 6;

// 녹화 앞부분의 흰 화면 길이를 영상에서 직접 잰다. 못 찾으면 0(=안 자름) —
// 조용히 엉뚱한 지점을 자르느니 리드가 긴 편이 낫다.
async function findFirstPaintSec(rawPath: string): Promise<number> {
  const { stdout } = await run(
    "ffmpeg",
    ["-hide_banner", "-v", "error", "-i", rawPath, "-vf", "fps=20,signalstats,metadata=print:file=-", "-f", "null", "-"],
    { timeoutMs: 120_000 },
  );
  let t = 0;
  const samples: Array<[number, number]> = [];
  for (const line of stdout.split("\n")) {
    const pts = /pts_time:([\d.]+)/.exec(line);
    if (pts) t = Number(pts[1]);
    const avg = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(line);
    if (avg) samples.push([t, Number(avg[1])]);
  }
  if (samples.length < 2) return 0;
  const white = samples[0][1];
  for (const [ts, y] of samples) {
    if (ts > FIRST_PAINT_MAX_SEC) break;
    if (y < white - FIRST_PAINT_DROP) return Math.max(0, ts - 0.05);
  }
  return 0;
}

export type PromoRecordInput = {
  clipId: string;
  taglineText: string;
  taglineReply?: string | null;
  locale: "ko" | "en";
  format: PromoFormat;
};

export type PromoRecordResult = {
  videoUrl: string;
  videoKey: string;
  posterUrl?: string;
  durationSec: number;
};

export async function recordPromoClip(input: PromoRecordInput): Promise<PromoRecordResult> {
  const { clipId, taglineText, taglineReply, locale, format } = input;
  const size = PROMO_FORMATS[format];
  const dir = `${PROMO_OUT_DIR}/${clipId}`;
  mkdirSync(dir, { recursive: true });
  const rawPath = `${dir}/raw.webm`;
  const clipPath = `${dir}/clip.mp4`;

  // 뷰포트 = 최종 출력 해상도 그대로(DSF 1). DSF 2로 논리 크기를 쓰면
  // Playwright가 CSS 뷰포트 크기의 프레임을 출력 캔버스 좌상단에 그대로
  // 붙이고 나머지를 회색으로 채운다(2026-08-18 프로브로 확인) — 반드시 DSF 1.
  // 해상도가 달라져도 레이아웃이 같으려면 /promo-record가 vw 기반이어야 한다
  // (그쪽 페이지에서 헤드라인 폰트 clamp 상한을 풀어둔 이유).
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  let context: Awaited<ReturnType<typeof browser.newContext>> | null = null;
  try {
    context = await browser.newContext({
      viewport: { width: size.outputW, height: size.outputH },
      deviceScaleFactor: 1,
      colorScheme: "light", // 다크 스킴으로 잡히면 크림 배경이 아니게 된다
      recordVideo: { dir, size: { width: size.outputW, height: size.outputH } },
    });
    const params = new URLSearchParams({ promo: taglineText, locale, format });
    const url = `${PROMO_APP_URL}/promo-record?${params.toString()}`;

    // ① 웹폰트(Noto Serif KR) 워밍용 페이지 — 여기서 한 번 받아두면 같은
    // 컨텍스트의 다음 페이지는 캐시로 즉시 그린다. 이걸 안 하면 타이핑 도중
    // sans → serif로 갈아끼는 게 그대로 녹화된다. 리로드로 처리하지 않는
    // 이유: 같은 페이지를 리로드하면 Playwright 비디오 타임라인이 벽시계와
    // 1초 이상 어긋나 앞부분 트림이 첫 글자를 잘라먹는다(2026-08-18 실측 —
    // 네비게이션 없는 단순 녹화는 오차 ~70ms).
    const warm = await context.newPage();
    await warm.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
    await warm
      .evaluate(() =>
        Promise.race([
          (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready,
          new Promise((r) => setTimeout(r, 5000)),
        ]),
      )
      .catch(() => {});
    const warmVideo = warm.video();
    await warm.close();
    await warmVideo?.delete().catch(() => {});

    // ② 실제 촬영 페이지 — 네비게이션 1회로 끝낸다.
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // 태그라인 드리프트(lib/loggedInTaglines.ts가 바뀌어 마커가 not-found)와
    // 페이지 자체 문제(배포 안 됨·네트워크 실패로 마커가 아예 안 뜸)를 구분해
    // 실패 사유를 명확히 남긴다 — 조용한 폴백으로 엉뚱한 화면이 찍히는 것보다
    // 여기서 멈추는 게 훨씬 낫다.
    const marker = await page
      .waitForSelector("[data-promo-tagline-status]", { timeout: 8000 })
      .catch(() => null);
    const status = marker ? await marker.getAttribute("data-promo-tagline-status") : null;
    if (status === "not-found") {
      throw new Error(
        `태그라인을 풀에서 찾지 못했어요(lib/loggedInTaglines.ts가 바뀌었을 수 있음): "${taglineText}"`,
      );
    }
    if (status !== "ok") {
      throw new Error(`촬영 마커를 찾지 못했어요 — ${PROMO_APP_URL}/promo-record가 정상 배포됐는지 확인해 주세요.`);
    }

    // 첫 글자가 찍힌 순간부터 남은 연출 시간을 센다 — 네비게이션·하이드레이션
    // 소요가 매번 달라서 goto 직후부터 세면 뒤가 잘리거나 남는다. h1은 빈 상태에서
    // zero-width space를 렌더하므로 그건 빼고 센다(LoggedInHeadline).
    await page.waitForFunction(
      () => {
        const h1 = document.querySelector(".vf-logged-in-headline h1");
        return !!h1 && (h1.textContent ?? "").replace(/\u200b/g, "").trim().length > 0;
      },
      { timeout: 15_000 },
    );

    // 문구가 **다 지워져 빈 화면이 된 순간**을 DOM으로 잡아 거기서 끊는다.
    // 시간 계산으로 끊으면 안 된다: 추정식의 안전마진(700ms)이 헤드라인이 다음
    // 사이클을 재시작하기까지의 여유(420ms)보다 커서, 다음 문구의 첫 글자가
    // 찍힌 상태로 엔드캡이 붙는다(2026-08-18 사용자 접수 — "영역전개…" 다 지운
    // 뒤 "영"이 한 글자 찍히고 로고 타이핑이 시작됨). 추정식은 이제 상한
    // 타임아웃으로만 쓴다.
    const recordMs = estimateTaglineRecordMs({ text: taglineText, reply: taglineReply ?? undefined });
    await page
      .waitForFunction(
        () => {
          const root = document.querySelector(".vf-logged-in-headline");
          if (!root) return false;
          // h1의 zero-width space와 답글 마커(↳)는 글자가 아니므로 뺀다.
          return (root.textContent ?? "").replace(/[\u200b↳]/g, "").trim().length === 0;
        },
        { timeout: Math.max(3000, recordMs) },
      )
      .catch(() => {}); // 못 잡으면 추정 길이까지 찍고 넘어간다(빈 화면 대신 문구가 남는 정도)
    // 다음 사이클 첫 글자까지 420ms — 그 안에서 빈 화면 여운만 조금 남긴다.
    await page.waitForTimeout(ERASED_TAIL_MS);

    const video = page.video();
    if (!video) throw new Error("recordVideo가 활성화되지 않았어요(Playwright 컨텍스트 설정 확인)");
    await context.close(); // 비디오는 컨텍스트가 닫혀야 파일로 확정된다
    context = null;
    await video.saveAs(rawPath);
    await video.delete().catch(() => {}); // Playwright가 남기는 page@*.webm 원본 정리

    // 영상 앞의 흰 화면(페이지가 그려지기 전 about:blank 구간)만 잘라낸다.
    // 벽시계로 계산하지 않는 이유: 네비게이션이 낀 녹화는 영상 타임라인이
    // 벽시계와 1초 이상 어긋나서(2026-08-18 실측) 첫 글자를 잘라먹었다.
    // 첫 페인트는 화면 전체가 흰색(#fff) → 크림(--bg #fdfaf3)으로 바뀌는
    // 큰 밝기 계단이라 영상 안에서 직접 찾는 게 훨씬 정확하다. 잘라낸 뒤 남는
    // 리드(빈 화면 + 깜빡이는 커서)는 페이지 자체의 프리롤 800ms다.
    const trimHeadSec = await findFirstPaintSec(rawPath);
    const { durationSec, posterPath } = await promoPostprocess({
      rawPath,
      outPath: clipPath,
      outW: size.outputW,
      outH: size.outputH,
      outDir: dir,
      trimHeadSec,
    });

    const ts = Date.now();
    const videoKey = `promo/${clipId}/clip-${ts}.mp4`;
    const videoUrl = await uploadToR2(videoKey, readFileSync(clipPath), "video/mp4");
    let posterUrl: string | undefined;
    if (posterPath) {
      posterUrl = await uploadToR2(`promo/${clipId}/poster-${ts}.jpg`, readFileSync(posterPath), "image/jpeg");
    }

    return { videoUrl, videoKey, posterUrl, durationSec };
  } finally {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
