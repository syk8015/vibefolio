// 홍보 클립 배치 촬영 — CLI 진입점. `npm run promo:batch`로 실행한다.
//
// worker.ts의 claim-next(조건부 UPDATE로 race 방지)·크래시 복구 패턴만
// 차용하고, 데모 파이프라인의 쿼터/heartbeat/kill-switch/이메일 알림은 전부
// 뺐다 — 유저 소유 데이터도 과금 유발도 없는 내부 전용 배치라 그 정도 가드가
// 불필요하다고 판단(계획 문서 참고). 상시 워커 유스케이스가 없으므로 이
// 스크립트는 "큐 소진하면 종료" 단일 동작만 한다(--batch 플래그 분기 자체가
// worker.ts와 달리 없음).
//
// --login-only: 자동 폼 로그인이 Turnstile 등으로 막힐 때, 사람이 직접
// 로그인하고 세션만 캡처한 뒤 종료한다.
import { createClient } from "@supabase/supabase-js";
import "./config"; // side-effect: .env.local 로드
import { recordPromoClip } from "./promo-record";
import { loginManually } from "./promo-session";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  }
  return createClient(url, key);
}

type Supabase = ReturnType<typeof db>;

type PendingClip = {
  id: string;
  tagline_text: string;
  tagline_reply: string | null;
};

// recording 상태로 남은 행 = 이전 실행이 중간에 죽은 흔적(worker.ts와 동일한
// 논리 — building/recording/editing은 워커만 쓰는 상태라 시작 시점에 남아있다면
// 전부 죽은 이전 작업이다).
async function recoverStuckClips(supabase: Supabase) {
  const { data, error } = await supabase.from("promo_clips").select("id").eq("status", "recording");
  if (error) {
    console.error(`[promo-worker] recovery scan failed: ${error.message}`);
    return;
  }
  for (const row of data ?? []) {
    console.log(`[promo-worker] recovering stuck clip ${row.id} → failed`);
    await supabase
      .from("promo_clips")
      .update({ status: "failed", error: "이전 실행이 중단됐어요(워커 재시작). 촬영 큐에 다시 추가해 주세요." })
      .eq("id", row.id);
  }
}

async function claimNext(supabase: Supabase): Promise<PendingClip | null> {
  const { data, error } = await supabase
    .from("promo_clips")
    .select("id, tagline_text, tagline_reply")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) {
    console.error(`[promo-worker] poll failed: ${error.message}`);
    return null;
  }
  for (const row of (data ?? []) as PendingClip[]) {
    // 조건부 UPDATE(row가 여전히 pending일 때만) — 만에 하나 워커가 두 번
    // 떠도 같은 클립을 이중 촬영하지 않는다.
    const { data: claimed, error: claimErr } = await supabase
      .from("promo_clips")
      .update({ status: "recording" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (claimErr) {
      console.error(`[promo-worker] claim failed for ${row.id}: ${claimErr.message}`);
      continue;
    }
    if (claimed && claimed.length === 1) return row;
  }
  return null;
}

async function processOne(supabase: Supabase, row: PendingClip) {
  console.log(`\n[promo-worker] clip ${row.id}  "${row.tagline_text.slice(0, 40)}..."`);
  try {
    const result = await recordPromoClip({
      clipId: row.id,
      taglineText: row.tagline_text,
      taglineReply: row.tagline_reply,
    });
    const { error } = await supabase
      .from("promo_clips")
      .update({
        status: "done",
        video_url: result.videoUrl,
        video_key: result.videoKey,
        poster_url: result.posterUrl ?? null,
        duration_sec: result.durationSec,
        recorded_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) console.error(`[promo-worker] done-status write failed for ${row.id}: ${error.message}`);
    else console.log(`[promo-worker] clip ${row.id} done → ${result.videoUrl}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[promo-worker] clip ${row.id} failed: ${message}`);
    const truncated = message.length > 1000 ? message.slice(0, 1000) + "…" : message;
    const { error } = await supabase.from("promo_clips").update({ status: "failed", error: truncated }).eq("id", row.id);
    if (error) console.error(`[promo-worker] failed-status write failed for ${row.id}: ${error.message}`);
  }
}

async function main() {
  if (process.argv.includes("--login-only")) {
    await loginManually();
    return;
  }

  const supabase = db();
  console.log("[promo-worker] nookframe 홍보 클립 배치 촬영");
  await recoverStuckClips(supabase);

  let processed = 0;
  for (;;) {
    const row = await claimNext(supabase);
    if (!row) break; // 큐 비면 종료 — 상시 워커가 아니므로 폴링하며 기다리지 않는다.
    await processOne(supabase, row);
    processed++;
  }
  console.log(`[promo-worker] 큐 소진 — ${processed}개 처리, 종료`);
}

await main();
