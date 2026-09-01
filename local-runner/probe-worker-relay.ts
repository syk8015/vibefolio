// 워커 서버 중계 e2e 프로브 — /api/worker/* 가 실제로 도는지 실서버에 대고 확인한다.
//
//   npx -y tsx local-runner/probe-worker-relay.ts
//   WORKER_API_ORIGIN=https://<preview>.vercel.app npx -y tsx local-runner/probe-worker-relay.ts
//
// 왜 필요한가: 2026-09-01에 워커가 서비스롤·R2·RESEND 키를 직접 쓰던 경로를 전부
// 이 API 뒤로 옮겼다. 키가 사라졌다는 것과 파이프라인이 여전히 돈다는 것은 다른
// 얘기라, 그 사이를 메우는 게 이 프로브다. 인증 게이트·큐 클레임·서명 업로드
// 왕복(진짜 바이트를 R2에 올렸다가 공개 URL로 되받는다)까지 본다.
//
// 부수효과: analytics_events에 probe 표식이 붙은 행 1개, 스토리지 _test/ 아래
// 작은 오브젝트 1개가 남는다. demo_paused는 읽은 값으로 반드시 되돌린다.
import "./config";
import { apiGet, apiPost, putSigned, WorkerApiError, type SignedTarget } from "./api";
import { AnalyticsEvent } from "../lib/analytics-events";

const ORIGIN = (
  process.env.WORKER_API_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || "https://nookframe.com"
).replace(/\/+$/, "");

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function rawStatus(path: string, auth: string | null): Promise<number> {
  const res = await fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: "{}",
  });
  return res.status;
}

async function expectStatus(label: string, fn: () => Promise<unknown>, want: number) {
  try {
    await fn();
    ok(label, false, `expected ${want}, got success`);
  } catch (err) {
    const got = err instanceof WorkerApiError ? err.status : 0;
    ok(label, got === want, `expected ${want}, got ${got}`);
  }
}

console.log(`[probe] worker relay → ${ORIGIN}\n`);

// ── 1. 인증 게이트 ─────────────────────────────────────────────────────────
console.log("1. auth gate");
ok("no Authorization → 401", (await rawStatus("/api/worker/heartbeat", null)) === 401);
ok("wrong secret → 401", (await rawStatus("/api/worker/heartbeat", "Bearer nope-not-the-secret")) === 401);
ok("malformed scheme → 401", (await rawStatus("/api/worker/heartbeat", "Basic abc")) === 401);

// ── 2. heartbeat + kill switch ─────────────────────────────────────────────
console.log("\n2. heartbeat / kill switch");
const hb = await apiPost<{ demoPaused: boolean }>("/api/worker/heartbeat", { status: "idle" });
ok("heartbeat returns demoPaused boolean", typeof hb.demoPaused === "boolean");
const originalPaused = hb.demoPaused;
console.log(`  (현재 demo_paused=${originalPaused} — 끝나면 이 값으로 되돌린다)`);

await apiPost("/api/worker/pause", { paused: !originalPaused });
const flipped = await apiPost<{ demoPaused: boolean }>("/api/worker/heartbeat", { status: "idle" });
ok("pause flip is observed by heartbeat", flipped.demoPaused === !originalPaused);
await apiPost("/api/worker/pause", { paused: originalPaused });
const restored = await apiPost<{ demoPaused: boolean }>("/api/worker/heartbeat", { status: "idle" });
ok("demo_paused restored", restored.demoPaused === originalPaused, `now ${restored.demoPaused}`);
await expectStatus("pause without boolean → 400", () => apiPost("/api/worker/pause", {}), 400);

// ── 3. claim ───────────────────────────────────────────────────────────────
console.log("\n3. claim");
const claim = await apiPost<{ job: unknown; reason: string }>("/api/worker/claim", { skipIds: [] });
ok("claim answers with a reason", ["claimed", "empty", "ceiling"].includes(claim.reason), claim.reason);
if (claim.reason === "claimed") {
  console.error("  ⚠ 실제 대기 잡을 클레임했다 — 이 프로브는 큐가 빈 상태에서 돌려야 한다.");
  console.error("     해당 잡은 building 상태로 남았다. 워커를 한 번 띄우면 복구된다.");
}

// ── 4. jobs 라우트 ─────────────────────────────────────────────────────────
console.log("\n4. jobs");
const ghost = "00000000-0000-4000-8000-000000000000";
const handle = await apiGet<{ handle: string | null }>(`/api/worker/jobs/${ghost}`);
ok("handle lookup for unknown project → null", handle.handle === null);
await expectStatus("unknown op → 400", () => apiPost(`/api/worker/jobs/${ghost}`, { op: "nope" }), 400);
await expectStatus("unknown phase → 400", () => apiPost(`/api/worker/jobs/${ghost}`, { op: "phase", phase: "dancing" }), 400);
await expectStatus("done without videoUrl → 400", () => apiPost(`/api/worker/jobs/${ghost}`, { op: "done" }), 400);
await expectStatus("held-credit on unknown job → 404", () => apiPost(`/api/worker/jobs/${ghost}`, { op: "held-credit" }), 404);

// ── 5. analytics ───────────────────────────────────────────────────────────
console.log("\n5. analytics");
await expectStatus(
  "unknown event name → 400",
  () => apiPost("/api/worker/analytics", { event: "totally_made_up_event" }),
  400,
);
await apiPost("/api/worker/analytics", {
  event: AnalyticsEvent.DemoFailed,
  userId: null,
  props: { probe: "worker-relay", projectId: ghost },
});
ok("known event accepted", true);

// ── 6. 서명 업로드 왕복 (진짜 바이트) ──────────────────────────────────────
console.log("\n6. signed upload round-trip");
const probeId = "manual-probe-relay";
const sign = await apiPost<{
  backend: string; ts: number; prefix: string; video: SignedTarget; poster: SignedTarget | null;
}>("/api/worker/assets", { op: "sign-upload", projectId: probeId, withPoster: false });
ok("dry-run prefix is _test/", sign.prefix === `_test/${probeId}/`, sign.prefix);
ok("key sits under the prefix", sign.video.key.startsWith(sign.prefix), sign.video.key);
ok("signed url is https", sign.video.url.startsWith("https://"));

const payload = Buffer.from(`nookframe worker relay probe ${sign.ts}`);
await putSigned(sign.video, payload);
ok("PUT to signed url accepted", true);

// 공개 URL로 되받아 바이트가 같은지. R2는 엣지 반영에 잠깐 걸릴 수 있어 재시도.
let fetched: Buffer | null = null;
for (let i = 0; i < 5; i++) {
  const res = await fetch(sign.video.publicUrl, { cache: "no-store" });
  if (res.ok) { fetched = Buffer.from(await res.arrayBuffer()); break; }
  await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
}
ok("uploaded bytes readable at the public url", !!fetched && fetched.equals(payload),
   fetched ? `got ${fetched.length}B want ${payload.length}B` : "never became readable");
console.log(`  (남은 프로브 오브젝트: ${sign.video.key})`);

// ── 7. assets 가드 ─────────────────────────────────────────────────────────
console.log("\n7. assets guards");
await expectStatus("sign-upload for unknown project → 404",
  () => apiPost("/api/worker/assets", { op: "sign-upload", projectId: ghost }), 404);
await expectStatus("source-list for unknown project → 404",
  () => apiPost("/api/worker/assets", { op: "source-list", projectId: ghost }), 404);
await expectStatus("source-list on a dry-run id → 400",
  () => apiPost("/api/worker/assets", { op: "source-list", projectId: probeId }), 400);
await expectStatus("traversal in dry-run id → 400",
  () => apiPost("/api/worker/assets", { op: "sign-upload", projectId: "manual-../../etc" }), 400);
await expectStatus("unknown assets op → 400",
  () => apiPost("/api/worker/assets", { op: "nope", projectId: probeId }), 400);
await expectStatus("bad promo clipId → 400",
  () => apiPost("/api/worker/assets", { op: "sign-promo-upload", clipId: "../evil" }), 400);

// ── 8. promo 큐 ────────────────────────────────────────────────────────────
console.log("\n8. promo queue");
await expectStatus("unknown promo op → 400", () => apiPost("/api/worker/promo", { op: "nope" }), 400);
await expectStatus("unknown promo clip op → 400",
  () => apiPost(`/api/worker/promo/${ghost}`, { op: "nope" }), 400);

console.log(`\n[probe] ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
