// `npm test` — 네트워크·비밀값 없이 도는 순수 함수 프로브만 차례로 돌린다.
// 하나라도 실패하면 non-zero. prod E2E(`scripts/probe-*.mjs`)는 여기 안 넣는다:
// 그것들은 실제 API를 때리고 쿼터를 소비하므로 손으로 돌린다.
// 조건: ffmpeg가 PATH에 있어야 한다(zoom 프로브 2개) — 러너 머신엔 원래 있다.
import { spawnSync } from "node:child_process";

const PROBES = [
  "scripts/probe-script-review-unit.mts",   // lib/demoScriptReview 대본 점검표
  "scripts/probe-embeddable-unit.mts",      // lib/embeddable 임베드 헤더 판정
  "local-runner/probe-focus-coalesce.ts",   // 스크롤 병합·focus 카메라 산식
  "local-runner/probe-zoomexpr.ts",         // zoompan 식 가드
  "scripts/test-zoom-filter-local.mts",     // 로컬 카메라 ffmpeg 체인
];

let failed = 0;
// cli/는 ESM 평문 JS라 타입검사가 없다 — 문법만이라도 실행 문맥(ESM)에서 확인한다.
// (0.1.10 MCP 서버가 따옴표 하나로 죽은 채 발행됐던 사고의 재발 방지.)
{
  const r = spawnSync("node", ["--check", "cli/src/mcp.js", "cli/src/publish.js", "cli/src/rerecord.js", "cli/src/drafts.js", "cli/src/echo.js", "cli/src/api.js", "cli/src/config.js", "cli/src/zip.js", "cli/bin/nookframe.js"], { encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} node --check cli/**/*.js`);
  if (!ok) console.log(r.stderr.split("\n").slice(0, 8).join("\n"));
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
