// 클립 1개의 촬영 오케스트레이션 — 순수 함수, DB 미접촉(claim/상태쓰기는
// promo-worker.ts 담당). local-runner의 저수준 캡처 유틸(browser.ts/record.ts)을
// 그대로 재사용하되, 데모 파이프라인의 explore/replay/camera/moderation은 전부
// 빼고 "정해진 문구가 타이핑되는 고정 샷 하나"만 찍는다. 로그인 불필요 —
// app/promo-record/page.tsx가 로그인 없는 전용 녹화 페이지라(2026-08-15
// 재설계) 세션 관리 계층 자체가 사라졌다.
import { mkdirSync, readFileSync } from "node:fs";
import { launchRecordingContext, ensureExactViewport, parkPhysicalCursor } from "./browser";
import { computeCropRect, resolveScreenDevice, startRecording, assertRawHasContent } from "./record";
import { promoPostprocess } from "./promo-postprocess";
import { estimateTaglineRecordMs } from "../lib/promo";
import { uploadToR2 } from "../lib/r2";
import { sleep } from "./util";
import { PROMO_APP_URL, PROMO_FORMATS, PROMO_OUT_DIR, type PromoFormat } from "./config";

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
  const rawPath = `${dir}/raw.mp4`;
  const clipPath = `${dir}/clip.mp4`;

  const { context, page } = await launchRecordingContext();
  try {
    const params = new URLSearchParams({ promo: taglineText, locale, format });
    await page.goto(`${PROMO_APP_URL}/promo-record?${params.toString()}`, { waitUntil: "domcontentloaded" });
    await ensureExactViewport(page, size.viewW, size.viewH);

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

    // 마우스 상호작용이 전혀 없는 정적 샷이지만, 물리 커서가 Dock/메뉴바 위에
    // 얹혀 있으면 툴팁이 화면에 찍힐 수 있다(browser.ts parkPhysicalCursor 주석
    // 참고) — 브라우저 자체의 탭/툴바 영역(크롭 밖)으로 옮겨 둔다.
    await parkPhysicalCursor(100, 30);
    const crop = await computeCropRect(page);
    const deviceIndex = await resolveScreenDevice();
    const rec = startRecording(rawPath, crop, deviceIndex);

    const recordMs = estimateTaglineRecordMs({ text: taglineText, reply: taglineReply ?? undefined });
    await sleep(recordMs);
    await rec.stop();
    await assertRawHasContent(rawPath);

    const { durationSec, posterPath } = await promoPostprocess({
      rawPath,
      outPath: clipPath,
      outW: size.outputW,
      outH: size.outputH,
      outDir: dir,
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
    await context.close();
  }
}
