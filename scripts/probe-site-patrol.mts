// 사이트 순찰(lib/sitePatrol.ts)을 실서버에 그대로 돌려 본다 — 점검 크론이 5분마다 하는 것과 같은 코드.
// 읽기만 한다(메일·DB 쓰기 없음). 쿼터를 쓰지 않는다.
//
// 사용: 레포 루트에서 `npx tsx scripts/probe-site-patrol.mts`
//   PROBE_ORIGIN=https://… 로 다른 주소를 두드릴 수 있다(기본 nookframe.com).
//   셋 중 하나라도 fail이면 종료 코드 1. skipped(영상 붙은 공개 작품이 무대에 없음)는 통과.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { runSitePatrol } from "../lib/sitePatrol";

const origin = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const r = await runSitePatrol(admin, { origin });
const mark = (s: string) => (s === "ok" ? "✓" : s === "skipped" ? "–" : "✗");
console.log(`${mark(r.oauthMeta)} 1. OAuth 발견 문서(/.well-known/oauth-authorization-server) — ${r.oauthMeta}`);
console.log(`${mark(r.mcpChallenge)} 2. 무인증 POST /api/mcp → 401 + resource_metadata — ${r.mcpChallenge}`);
console.log(`${mark(r.ownerVideo)} 3. 영상 작품 주인 명함에 <video> — ${r.ownerVideo}${r.ownerVideoPage ? ` (${r.ownerVideoPage})` : ""}`);
for (const n of r.notes) console.log(`  · ${n}`);
process.exit([r.oauthMeta, r.mcpChallenge, r.ownerVideo].includes("fail") ? 1 : 0);
