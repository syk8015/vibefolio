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
import { estimateTaglineRecordMs, type PromoOpening } from "../lib/promo";
import { uploadToR2 } from "../lib/r2";
import { PROMO_APP_URL, PROMO_FORMATS, PROMO_OUT_DIR, type PromoFormat } from "./config";
import { run, ffprobeValue } from "./util";

// 첫 페인트(흰→크림)를 찾을 때 쓰는 밝기 계단 임계값과 탐색 상한.
// 크림 배경은 흰 화면보다 YAVG가 ~11 낮게 잡힌다(2026-08-18 실측).
const FIRST_PAINT_DROP = 4;
// 다 지워진 뒤 녹화를 더 돌릴 시간. 다음 사이클 첫 글자는 420ms(runPhrase 예약)
// + 90~150ms(첫 타이핑 간격) = 최소 510ms 뒤에 보이므로 그보다 짧아야 한다.
const ERASED_TAIL_MS = 350;
// 정지가 시작된 뒤 남길 여운. 길게 두면 커서가 안 깜빡이는 정지 화면이 그대로
// 보이므로 짧게. 엔드캡이 자체 리드(0.35s 커서 깜빡임)로 이어받는다.
const TAIL_HOLD_SEC = 0.15;
// 클립 시작 지점 = 문구가 이 비율만큼 쳐진 순간. 피드에서 자동재생될 때
// 첫 프레임이 빈 화면이면 스크롤을 멈출 이유가 없다 — 이미 읽을 게 있는
// 상태에서 시작해야 한다(2026-08-19 사용자 결정). 글자 면적 기준이라 문구
// 길이에 따라 알아서 스케일된다.
const HOOK_TYPED_FRACTION = 0.35;
const HOOK_LEAD_SEC = 0.12; // 그 프레임 직전 약간의 여유

// freezedetect 최소 정지 길이. 커서 반주기(0.475s)보다 커야 살아있는 화면을
// 정지로 오인하지 않는다.
const FREEZE_MIN_SEC = 0.55;
// 허용 오차. 기본값(-60dB)이나 -50dB로는 **타이핑 구간까지 "정지"로 잡힌다** —
// 1080×1920 크림 배경에서 글자 한 자가 차지하는 면적이 워낙 작아 프레임 평균
// 차이가 임계 아래로 떨어지기 때문(2026-08-18 실측: -50dB에서 0.52~5.12s를
// 정지로 오판). 0.0001이면 커서 깜빡임(≈0.00028)은 살고 정지만 잡힌다.
const FREEZE_NOISE = "0.0001";
const FIRST_PAINT_MAX_SEC = 6;

// 첫 페인트(흰 화면 → 크림 배경) 시각을 영상에서 직접 잰다. 못 찾으면 0.
// 앞 트림의 기준이자, 벽시계 ↔ 영상시간을 잇는 유일한 앵커다.
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
    if (y < white - FIRST_PAINT_DROP) return ts;
  }
  return 0;
}

export type PromoRecordInput = {
  clipId: string;
  taglineText: string;
  taglineReply?: string | null;
  locale: "ko" | "en";
  format: PromoFormat;
  // 시작 방식. full=빈 화면부터 한 글자씩(+페이드인) · hook=문구가 쳐진 지점부터.
  opening?: PromoOpening;
};

export type PromoRecordResult = {
  videoUrl: string;
  videoKey: string;
  posterUrl?: string;
  durationSec: number;
};

// 영상 끝의 "더 이상 안 변하는" 구간이 시작되는 시각. 없으면 undefined.
async function findTailFreezeSec(rawPath: string): Promise<number | undefined> {
  try {
    const { stdout } = await run(
      "ffmpeg",
      ["-hide_banner", "-v", "error", "-i", rawPath,
       "-vf", `freezedetect=n=${FREEZE_NOISE}:d=${FREEZE_MIN_SEC},metadata=mode=print:file=-`, "-f", "null", "-"],
      { timeoutMs: 120_000 },
    );
    const starts = [...stdout.matchAll(/lavfi\.freezedetect\.freeze_start=([\d.]+)/g)].map((m) => Number(m[1]));
    if (!starts.length) return undefined;
    const last = starts[starts.length - 1];
    const dur = (await ffprobeValue(rawPath, "format=duration")) ?? 0;
    // 끝까지 이어지는 정지만 자른다(중간에 잠깐 멎은 건 연출일 수 있음).
    return dur > 0 && dur - last > 0.4 ? last : undefined;
  } catch {
    return undefined;
  }
}

// 프레임별 "어두운 픽셀 면적"(=글자+커서가 차지하는 넓이)을 재서, 문구가
// HOOK_TYPED_FRACTION만큼 쳐진 시점을 찾는다. 못 찾으면 undefined.
//
// 커서와 글자를 어떻게 가르냐가 핵심이다: **커서는 깜빡이므로 타이핑 전에는
// 화면이 주기적으로 완전히 비지만, 첫 글자가 찍힌 뒤로는 절대 안 빈다.**
// 그래서 "최고점 이전의 마지막 빈 프레임" 다음이 곧 타이핑 시작이고, 그
// 뒤부터 면적 임계를 넘는 지점을 찾으면 커서에 속지 않는다(면적 임계만 쓰면
// 짧은 문구에서 커서 하나를 글자로 오인한다).
async function findHookStartSec(rawPath: string): Promise<number | undefined> {
  const { stdout } = await run(
    "ffmpeg",
    ["-hide_banner", "-v", "error", "-i", rawPath,
     // 가운데 띠만 본다(브라우저/개발 배지 등 주변 요소 배제) → 어두운 픽셀만
     // 흰색으로 이진화 → YAVG가 곧 "어두운 픽셀 비율 × 255".
     "-vf", "fps=20,crop=iw:ih/3:0:ih/3,lutyuv=y=if(lt(val\\,110)\\,255\\,0),signalstats,metadata=print:file=-",
     "-f", "null", "-"],
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
  if (samples.length < 10) return undefined;

  const values = samples.map(([, v]) => v);
  const base = Math.min(...values);
  const peak = Math.max(...values);
  if (peak - base < 0.2) return undefined; // 글자가 거의 없다 = 판정 불가
  const peakAt = samples.find(([, v]) => v === peak)?.[0] ?? 0;

  // 최고점 이전의 마지막 "완전히 빈" 프레임 = 타이핑 직전.
  let typingFrom = 0;
  for (const [ts, v] of samples) {
    if (ts >= peakAt) break;
    if (v <= base + 0.02) typingFrom = ts;
  }

  const target = base + (peak - base) * HOOK_TYPED_FRACTION;
  for (const [ts, v] of samples) {
    if (ts <= typingFrom) continue;
    if (v >= target) return Math.max(0, ts - HOOK_LEAD_SEC);
  }
  return undefined;
}

export async function recordPromoClip(input: PromoRecordInput): Promise<PromoRecordResult> {
  const { clipId, taglineText, taglineReply, locale, format } = input;
  const opening: PromoOpening = input.opening ?? "hook";
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
    // 앞 트림. opening=hook이면 문구가 어느 정도 쳐진 지점에서 시작하고,
    // full이면 흰 화면만 잘라내 빈 화면(깜빡이는 커서)부터 보여준다.
    // hook에서 판정에 실패해도 full과 같은 방식으로 물러난다.
    const hookAt = opening === "hook" ? await findHookStartSec(rawPath) : undefined;
    const firstPaintSec = hookAt === undefined ? await findFirstPaintSec(rawPath) : 0;
    const trimHeadSec = hookAt ?? Math.max(0, firstPaintSec - 0.05);

    // 뒤쪽 **얼어붙은 구간** 잘라내기. Playwright는 녹화가 끝날 때까지 마지막
    // 프레임을 그대로 채워 넣는다 — 문구를 다 지운 뒤 1초 가까이 정지 화면이
    // 붙고(커서 깜빡임도 멎는다) 거기서 엔드캡 커서가 새로 뜨니 커서가 툭
    // 끊겨 보였다(2026-08-18 사용자 접수). 벽시계로 계산하지 않는다: 흰 화면
    // 앵커는 어떤 판에선 아예 안 찍힌다(영상이 첫 페인트 이후에 시작). 대신
    // "화면이 더 이상 안 변하는 시점"을 ffmpeg freezedetect로 직접 찾는다 —
    // 커서가 0.475s마다 깜빡이므로 살아있는 구간은 절대 freeze로 안 잡힌다.
    const freezeAt = await findTailFreezeSec(rawPath);
    const trimTailAtSec = freezeAt !== undefined ? freezeAt + TAIL_HOLD_SEC : undefined;
    console.log(
      `[promo-record] ${opening} · 앞 ${trimHeadSec.toFixed(2)}s 트림(${hookAt === undefined ? "흰화면 기준" : "문구 " + Math.round(HOOK_TYPED_FRACTION * 100) + "% 지점"})` +
        (trimTailAtSec ? ` · ${trimTailAtSec.toFixed(2)}s에서 끊음(정지 시작 ${freezeAt?.toFixed(2)}s)` : " · 뒤 정지구간 없음"),
    );

    const { durationSec, posterPath } = await promoPostprocess({
      rawPath,
      outPath: clipPath,
      outW: size.outputW,
      outH: size.outputH,
      outDir: dir,
      trimHeadSec,
      trimTailAtSec,
      // 페이드인은 full에서만. hook은 첫 프레임에 문구가 보이는 게 목적인데
      // 검은 화면에서 밝아지는 0.25초가 그걸 도로 가린다.
      fadeInSec: opening === "full" ? 0.25 : 0,
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
