// 비상 정지 게이트(lib/siteLock.ts lockBlock) — 순수 함수 프로브. `npm test`.
import { lockBlock, type SiteLocks } from "../lib/siteLock";

const OPEN: SiteLocks = { readonly: false, uploadsClosed: false };
const RO: SiteLocks = { readonly: true, uploadsClosed: false };
const UP: SiteLocks = { readonly: false, uploadsClosed: true };

const cases: [string, string, SiteLocks, string | null][] = [
  // 열려 있으면 아무것도 안 막는다
  ["POST", "/api/ingest", OPEN, null],
  ["POST", "/api/storage/sign", OPEN, null],
  // 읽기는 늘 통과
  ["GET", "/api/ingest/status", RO, null],
  ["GET", "/api/preview/x/index.html", RO, null],
  ["HEAD", "/api/storage/sign", UP, null],
  ["OPTIONS", "/api/mcp", RO, null],
  ["GET", "/dashboard", RO, null],
  // 페이지 주소(POST 서버 액션 등)는 /api가 아니라 게이트 밖 — 트리거가 둘째 겹
  ["POST", "/dashboard", RO, null],
  // 읽기 전용: 기본은 막힘
  ["POST", "/api/ingest", RO, "SITE_READONLY"],
  ["POST", "/api/storage/sign", RO, "SITE_READONLY"],
  ["POST", "/api/tokens", RO, "SITE_READONLY"],
  ["POST", "/api/connect/exchange", RO, "SITE_READONLY"],
  ["POST", "/api/oauth/token", RO, "SITE_READONLY"],
  ["POST", "/api/projects/abc/trigger-demo", RO, "SITE_READONLY"],
  ["PATCH", "/api/ingest/drafts/abc", RO, "SITE_READONLY"],
  ["DELETE", "/api/account", RO, "SITE_READONLY"],
  ["POST", "/api/worker/video", RO, "SITE_READONLY"],
  ["post", "/api/handoff", RO, "SITE_READONLY"],
  // 읽기 전용 중에도 열어 둔 것
  ["POST", "/api/admin/stop", RO, null],
  ["POST", "/api/admin/reports/abc", RO, null],
  ["POST", "/api/auth/logout", RO, null],
  ["DELETE", "/api/tokens/abc", RO, null],
  ["POST", "/api/tokens/abc", RO, "SITE_READONLY"],
  ["POST", "/api/worker/heartbeat", RO, null],
  ["POST", "/api/worker/pause", RO, null],
  ["POST", "/api/mcp", RO, null],
  ["POST", "/api/track", RO, null],
  ["POST", "/api/report", RO, null],
  // 이웃 주소가 열린 목록 앞부분에 얹혀 열리지 않게
  ["POST", "/api/adminx", RO, "SITE_READONLY"],
  // 업로드 닫기: 올리는 길만
  ["POST", "/api/storage/sign", UP, "UPLOADS_CLOSED"],
  ["POST", "/api/ingest", UP, "UPLOADS_CLOSED"],
  ["POST", "/api/ingest/finalize", UP, "UPLOADS_CLOSED"],
  ["PATCH", "/api/ingest/drafts/abc", UP, "UPLOADS_CLOSED"],
  ["POST", "/api/ingest/rerecord/abc", UP, "UPLOADS_CLOSED"],
  ["POST", "/api/projects/abc/demo-assets", UP, "UPLOADS_CLOSED"],
  ["POST", "/api/ingestx", UP, null],
  ["POST", "/api/projects/abc/captions", UP, null],
  ["POST", "/api/tokens", UP, null],
  ["POST", "/api/admin/stop", UP, null],
  // 둘 다 켜져 있으면 읽기 전용이 먼저
  ["POST", "/api/storage/sign", { readonly: true, uploadsClosed: true }, "SITE_READONLY"],
];

let fail = 0;
for (const [m, p, locks, want] of cases) {
  const got = lockBlock(m, p, locks);
  if (got !== want) {
    fail++;
    console.error(`✗ ${m} ${p} ${JSON.stringify(locks)} → ${got}, 기대 ${want}`);
  }
}
if (fail) {
  console.error(`site-lock: ${fail}/${cases.length} 실패`);
  process.exit(1);
}
console.log(`✓ site-lock: ${cases.length}건`);
