// 클립 1개의 촬영 오케스트레이션 — 순수 함수, DB 미접촉(claim/상태쓰기는
// promo-worker.ts 담당). local-runner의 저수준 캡처 유틸(browser.ts/record.ts)을
// 그대로 재사용하되, 데모 파이프라인의 explore/replay/camera/moderation은 전부
// 빼고 "정해진 문구가 타이핑되는 고정 샷 하나"만 찍는다.
import { mkdirSync, readFileSync } from "node:fs";
import { launchRecordingContext, ensureExactViewport, parkPhysicalCursor } from "./browser";
import { computeCropRect, resolveScreenDevice, startRecording, assertRawHasContent } from "./record";
import { promoPostprocess } from "./promo-postprocess";
import { ensurePromoSession } from "./promo-session";
import { estimateTaglineRecordMs } from "../lib/promo";
import { uploadToR2 } from "../lib/r2";
import { sleep } from "./util";
import {
  PROMO_APP_URL,
  PROMO_VIEW_W,
  PROMO_VIEW_H,
  PROMO_OUTPUT_W,
  PROMO_OUTPUT_H,
  PROMO_OUT_DIR,
} from "./config";

export type PromoRecordInput = {
  clipId: string;
  taglineText: string;
  taglineReply?: string | null;
};

export type PromoRecordResult = {
  videoUrl: string;
  videoKey: string;
  posterUrl?: string;
  durationSec: number;
};

export async function recordPromoClip(input: PromoRecordInput): Promise<PromoRecordResult> {
  const { clipId, taglineText, taglineReply } = input;
  const storageState = await ensurePromoSession();
  const dir = `${PROMO_OUT_DIR}/${clipId}`;
  mkdirSync(dir, { recursive: true });
  const rawPath = `${dir}/raw.mp4`;
  const clipPath = `${dir}/clip.mp4`;

  const { context, page } = await launchRecordingContext(storageState);
  try {
    const url = `${PROMO_APP_URL}/?promo=${encodeURIComponent(taglineText)}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await ensureExactViewport(page, PROMO_VIEW_W, PROMO_VIEW_H);

    // 세션 만료(로그인 후 화면이 안 떠서 마커 자체가 없음)와 태그라인 드리프트
    // (마커는 있지만 not-found)를 구분해 실패 사유를 명확히 남긴다 — 조용한
    // 폴백으로 엉뚱한 화면이 찍히는 것보다 여기서 멈추는 게 훨씬 낫다.
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
      throw new Error(
        "촬영 마커를 찾지 못했어요 — 로그인 세션이 만료됐을 수 있어요 " +
          "(local-runner/.promo-session.json 삭제 후 --login-only로 재로그인해 주세요)",
      );
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
      outW: PROMO_OUTPUT_W,
      outH: PROMO_OUTPUT_H,
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
