// `npm test` — 네트워크·비밀값 없이 도는 순수 함수 프로브만 차례로 돌린다.
// 하나라도 실패하면 non-zero. prod E2E(`scripts/probe-*.mjs`)는 여기 안 넣는다:
// 그것들은 실제 API를 때리고 쿼터를 소비하므로 손으로 돌린다.
// 조건: ffmpeg가 PATH에 있어야 한다(zoom 프로브 2개) — 러너 머신엔 원래 있다.
import { spawnSync } from "node:child_process";

const PROBES = [
  "scripts/probe-script-review-unit.mts",   // lib/demoScriptReview 대본 점검표
  "local-runner/probe-focus-coalesce.ts",   // 스크롤 병합·focus 카메라 산식
  "local-runner/probe-zoomexpr.ts",         // zoompan 식 가드
  "scripts/test-zoom-filter-local.mts",     // 로컬 카메라 ffmpeg 체인
];

let failed = 0;
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
