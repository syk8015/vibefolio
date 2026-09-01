// 홍보 클립 배치 촬영 — CLI 진입점. `npm run promo:batch`로 실행한다.
//
// worker.ts의 claim-next(조건부 UPDATE로 race 방지)·크래시 복구 패턴만
// 차용하고, 데모 파이프라인의 쿼터/heartbeat/kill-switch/이메일 알림은 전부
// 뺐다 — 유저 소유 데이터도 과금 유발도 없는 내부 전용 배치라 그 정도 가드가
// 불필요하다고 판단(계획 문서 참고). 상시 워커 유스케이스가 없으므로 이
// 스크립트는 "큐 소진하면 종료" 단일 동작만 한다(--batch 플래그 분기 자체가
// worker.ts와 달리 없음). 로그인 불필요(2026-08-15 재설계로 세션 관리 계층이
// 사라짐 — app/promo-record/page.tsx가 로그인 없는 전용 녹화 페이지).
//
// DB 접근은 전부 /api/worker/promo 경유다 — 이 기기엔 서비스롤 키가 없다
// (local-runner/api.ts).
import "./config"; // side-effect: .env.local 로드
import { apiPost, apiPostQuiet } from "./api";
import { recordPromoClip } from "./promo-record";
import type { PromoFormat } from "./config";
import type { PromoOpening } from "../lib/promo";

type PendingClip = {
  id: string;
  tagline_text: string;
  tagline_reply: string | null;
  tagline_locale: "ko" | "en";
  format: PromoFormat;
  opening: PromoOpening;
};

// recording 상태로 남은 행 = 이전 실행이 중간에 죽은 흔적(worker.ts와 동일한
// 논리 — building/recording/editing은 워커만 쓰는 상태라 시작 시점에 남아있다면
// 전부 죽은 이전 작업이다).
async function recoverStuckClips() {
  const res = await apiPostQuiet<{ recovered: string[] }>("/api/worker/promo", { op: "recover" });
  for (const id of res?.recovered ?? []) {
    console.log(`[promo-worker] recovering stuck clip ${id} → failed`);
  }
}

// 조건부 UPDATE(row가 여전히 pending일 때만)는 서버가 한다 — 만에 하나 워커가
// 두 번 떠도 같은 클립을 이중 촬영하지 않는다.
async function claimNext(): Promise<PendingClip | null> {
  const res = await apiPostQuiet<{ clip: PendingClip | null }>("/api/worker/promo", { op: "claim" });
  return res?.clip ?? null;
}

async function processOne(row: PendingClip) {
  console.log(`\n[promo-worker] clip ${row.id} (${row.format} · ${row.opening})  "${row.tagline_text.slice(0, 40)}..."`);
  try {
    const result = await recordPromoClip({
      clipId: row.id,
      taglineText: row.tagline_text,
      taglineReply: row.tagline_reply,
      locale: row.tagline_locale,
      format: row.format,
      opening: row.opening,
    });
    await apiPost(`/api/worker/promo/${encodeURIComponent(row.id)}`, {
      op: "done",
      videoUrl: result.videoUrl,
      videoKey: result.videoKey,
      posterUrl: result.posterUrl ?? null,
      durationSec: result.durationSec,
    });
    console.log(`[promo-worker] clip ${row.id} done → ${result.videoUrl}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[promo-worker] clip ${row.id} failed: ${message}`);
    await apiPostQuiet(`/api/worker/promo/${encodeURIComponent(row.id)}`, { op: "failed", message });
  }
}

async function main() {
  console.log("[promo-worker] nookframe 홍보 클립 배치 촬영");
  await recoverStuckClips();

  let processed = 0;
  for (;;) {
    const row = await claimNext();
    if (!row) break; // 큐 비면 종료 — 상시 워커가 아니므로 폴링하며 기다리지 않는다.
    await processOne(row);
    processed++;
  }
  console.log(`[promo-worker] 큐 소진 — ${processed}개 처리, 종료`);
}

await main();
