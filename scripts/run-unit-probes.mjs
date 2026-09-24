// `npm test` — 네트워크·비밀값 없이 도는 순수 함수 프로브만 차례로 돌린다.
// 하나라도 실패하면 non-zero. prod E2E(`scripts/probe-*.mjs`)는 여기 안 넣는다:
// 그것들은 실제 API를 때리고 쿼터를 소비하므로 손으로 돌린다.
// 조건: ffmpeg가 PATH에 있어야 한다(zoom 프로브 2개) — 러너 머신엔 원래 있다.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const PROBES = [
  "scripts/probe-script-review-unit.mts",   // lib/demoScriptReview 대본 점검표
  "scripts/probe-embeddable-unit.mts",      // lib/embeddable 임베드 헤더 판정
  "scripts/probe-prompt-secrets-unit.mts",  // 프롬프트 3종에 토큰이 안 실리는지(1회용 코드만)
  "scripts/probe-schema-drift.mts",         // 생성물(cli/src/schema.js·lib/mcpTools.ts)이 원본과 어긋났는지
  "scripts/probe-oauth-unit.mts",           // 원격 MCP OAuth — CIMD 두 항목·client_id 규칙·PKCE
  "scripts/probe-safe-next-unit.mts",     // 로그인 뒤 돌아갈 곳(?next=) — 밖으로 튕기는 모양 차단
  "scripts/probe-demo-access-unit.mts",     // demoAccess에 토큰·비번 이름이 오면 400(공개 칸이라 새어 나감)
  "scripts/probe-project-columns.mts",      // projects 공개/비공개 칸 목록 == SQL GRANT, select("*") 금지(칸 단위 읽기 권한)
  "scripts/probe-owner-private-unit.mts",   // 대시보드 비공개 칸 합치기·"서버에 다시 물을지" 판정(대본만 고친 초안 놓치지 않기)
  "scripts/probe-native-app-unit.mts",      // 못 찍는 앱 판별 — 데스크톱·확장 추가, 웹으로 찍을 것은 안 건드림
  "scripts/probe-storage-list-unit.mts",    // 삭제 경로의 폴더 나열 — 1000개 넘는 폴더도 끝까지(탈퇴 즉시 파기)
  "scripts/probe-ingest-store-unit.mts",    // zip 저장 — 동시 업로드(상한 8)·실패 뒤 늦은 업로드 없음·새 행 폴더 정리
  "scripts/probe-html-body-unit.mts",
  "scripts/probe-handoff-unit.mts",         // 폰→컴퓨터 넘기기 — 이메일 정리·알림 창·링크에 이메일 없음       // 채팅창이 글자로 넘긴 HTML — 잘림 감지·울타리·zip 변환
  "scripts/probe-site-patrol-unit.mts",     // 점검 크론의 사이트 순찰 — 발견 문서 두 항목·MCP 401·명함 무대 영상 대상 고르기
  "scripts/probe-promo-unit.mts",           // 홍보 예약 — 피드 언어로 채널 고르기·하루 1편 한국 시각 칸·채널별 캡션 꼬리
  "scripts/probe-cli-input.mjs",            // CLI --file·표준입력·schema (127.0.0.1 가짜 서버, 네트워크 없음)
  "local-runner/probe-focus-coalesce.ts",   // 스크롤 병합·focus 카메라 산식
  "local-runner/probe-zoomexpr.ts",         // zoompan 식 가드
  "scripts/test-zoom-filter-local.mts",     // 로컬 카메라 ffmpeg 체인
  "local-runner/dispatch/probe-dispatch.mjs", // 자동 실행기 — 큐·한도 게이트·산출물 수거 (node --test 53개)
];

let failed = 0;
// cli/는 ESM 평문 JS라 타입검사가 없다 — 문법만이라도 실행 문맥(ESM)에서 확인한다.
// (0.1.10 MCP 서버가 따옴표 하나로 죽은 채 발행됐던 사고의 재발 방지.)
// node --check는 첫 파일만 검사하고 뒤 파일은 스크립트 인자로 넘긴다 — 파일마다 따로 돌린다.
// 목록은 폴더에서 읽는다(새 파일을 적어 넣는 걸 잊어도 빠지지 않게).
{
  const files = [
    ...readdirSync("cli/src").filter((f) => f.endsWith(".js")).map((f) => `cli/src/${f}`),
    "cli/bin/nookframe.js",
  ];
  const bad = [];
  for (const f of files) {
    const r = spawnSync("node", ["--check", f], { encoding: "utf8" });
    if (r.status !== 0) bad.push(`${f}\n${r.stderr.split("\n").slice(0, 6).join("\n")}`);
  }
  const ok = bad.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} node --check cli/**/*.js (${files.length} files)`);
  if (!ok) console.log(bad.join("\n"));
}
for (const file of PROBES) {
  const t0 = Date.now();
  const r = spawnSync("npx", ["-y", "tsx", file], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!ok) console.log((r.stdout + r.stderr).split("\n").slice(-25).join("\n"));
}
console.log(failed ? `\n${failed} probe(s) FAILED` : `\nall ${PROBES.length} probes passed`);
process.exit(failed ? 1 : 0);
