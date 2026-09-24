// 사이트 순찰 순수 판정(lib/sitePatrol.ts) — 네트워크 없음. `npm test`에 연결.
// 실서버에서 실제로 두드려 보려면: `npx tsx scripts/probe-site-patrol.mts`
import assert from "node:assert/strict";
import {
  authServerMetaOk, mcpChallengeOk, htmlHasVideo, stageRendersVideo,
  initialStageProject, pickVideoStageOwner, type PatrolProjectRow,
} from "../lib/sitePatrol";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`✓ ${name}`); };

t("발견 문서: CIMD 두 항목이 같이 있어야 통과", () => {
  const good = { client_id_metadata_document_supported: true, token_endpoint_auth_methods_supported: ["none"] };
  assert.equal(authServerMetaOk(good), true);
  assert.equal(authServerMetaOk({ ...good, client_id_metadata_document_supported: undefined }), false);
  assert.equal(authServerMetaOk({ ...good, client_id_metadata_document_supported: "true" }), false);
  assert.equal(authServerMetaOk({ ...good, token_endpoint_auth_methods_supported: ["client_secret_post"] }), false);
  assert.equal(authServerMetaOk({ ...good, token_endpoint_auth_methods_supported: "none" }), false);
  assert.equal(authServerMetaOk(null), false);
  assert.equal(authServerMetaOk("<html>"), false);
});

t("MCP: 401 + resource_metadata 안내만 통과", () => {
  const h = 'Bearer error="invalid_token", resource_metadata="https://nookframe.com/.well-known/oauth-protected-resource/api/mcp", scope="x"';
  assert.equal(mcpChallengeOk(401, h), true);
  assert.equal(mcpChallengeOk(200, h), false);
  assert.equal(mcpChallengeOk(500, h), false);
  assert.equal(mcpChallengeOk(401, null), false);
  assert.equal(mcpChallengeOk(401, 'Bearer error="invalid_token"'), false);
  assert.equal(mcpChallengeOk(401, 'Bearer resource_metadata=""'), false);
});

t("HTML: <video> 요소만 센다", () => {
  assert.equal(htmlHasVideo('<div><video class="x" muted></video></div>'), true);
  assert.equal(htmlHasVideo("<VIDEO>"), true);
  assert.equal(htmlHasVideo('<p>video</p><img alt="<video-ish>">'), false);
  assert.equal(htmlHasVideo('<videos>'), false);
});

t("무대 영상: 수동 youtube는 iframe이라 아님, 자동 mp4는 <video>", () => {
  assert.equal(stageRendersVideo({ video_url: null, demo_video_url: "https://r2/demo-1.mp4" }), true);
  assert.equal(stageRendersVideo({ video_url: "https://youtu.be/abcdefg", demo_video_url: "https://r2/demo-1.mp4" }), false);
  assert.equal(stageRendersVideo({ video_url: "https://x.com/clip.mp4", demo_video_url: null }), true);
  // 알 수 없는 수동 주소는 무대가 무시하고 자동 영상으로 넘어간다.
  assert.equal(stageRendersVideo({ video_url: "https://example.com/page", demo_video_url: "https://r2/demo-1.mp4" }), true);
  assert.equal(stageRendersVideo({ video_url: "https://example.com/page", demo_video_url: null }), false);
  assert.equal(stageRendersVideo({ video_url: null, demo_video_url: null }), false);
});

const row = (o: Partial<PatrolProjectRow>): PatrolProjectRow => ({
  user_id: "u1", video_url: null, demo_video_url: null, is_featured: false, sort_order: 0,
  created_at: "2026-09-01T00:00:00Z", ...o,
});

t("무대 첫 작품: 명함과 같은 순서(sort_order↑ → 최신↓, null은 뒤) + 대표작 우선", () => {
  const a = row({ demo_video_url: "a", sort_order: 1 });
  const b = row({ demo_video_url: "b", sort_order: 0, created_at: "2026-09-01T00:00:00Z" });
  const c = row({ demo_video_url: "c", sort_order: 0, created_at: "2026-09-05T00:00:00Z" });
  const d = row({ demo_video_url: "d", sort_order: null });
  assert.equal(initialStageProject([a, b, c, d]), c);
  assert.equal(initialStageProject([d, a]), a);
  assert.equal(initialStageProject([a, b, { ...d, is_featured: true }])?.demo_video_url, "d");
  assert.equal(initialStageProject([]), null);
});

t("대상 고르기: 무대 첫 작품이 영상인 주인만(아니면 건너뜀 — 헛경보 방지)", () => {
  // u1은 영상 작품이 있지만 무대 첫 작품엔 영상이 없다 → 명함에 <video>가 없는 게 정상.
  const u1 = [row({ user_id: "u1", sort_order: 0 }), row({ user_id: "u1", sort_order: 1, demo_video_url: "v" })];
  assert.equal(pickVideoStageOwner(u1), null);
  const u2 = [row({ user_id: "u2", demo_video_url: "v" })];
  assert.equal(pickVideoStageOwner([...u1, ...u2]), "u2");
  assert.equal(pickVideoStageOwner([]), null);
});

console.log(`\n${n} checks passed`);
