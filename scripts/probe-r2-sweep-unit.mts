// R2 남은 영상 청소 판정(네트워크 없음) — lib/r2Sweep.ts.
// 사용: `npx -y tsx scripts/probe-r2-sweep-unit.mts`
//
// 무엇을 보나: (1) 하루 한 번 틱(한국 새벽 3시) (2) 작품 트리(UUID/UUID/)만 폴더로 묶고 promo/·_test/는
// 버림 (3) 폴더의 가장 최근 파일 시각 (4) 행이 있으면 안 지움·하루 안 된 폴더 안 지움·상한.
import {
  isR2SweepTick, groupProjectFolders, pickOrphans, R2_SWEEP_MIN_AGE_MS, R2_SWEEP_MAX_PREFIXES,
} from "../lib/r2Sweep";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const U = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-10-01T18:00:30Z");
const DAY = R2_SWEEP_MIN_AGE_MS;

// (1)
ok("UTC 18:00~18:04 = 청소 틱", isR2SweepTick(Date.parse("2026-10-01T18:00:00Z")) && isR2SweepTick(Date.parse("2026-10-01T18:04:59Z")));
ok("그 밖 = 안 함", !isR2SweepTick(Date.parse("2026-10-01T18:05:00Z")) && !isR2SweepTick(Date.parse("2026-10-01T03:00:00Z")));

// (2)(3)
const folders = groupProjectFolders([
  { key: `${U}/${P1}/demo-1.mp4`, lastModified: NOW - 3 * DAY },
  { key: `${U}/${P1}/poster-1.jpg`, lastModified: NOW - 2 * DAY },
  { key: `${U}/${P2}/demo-2.mp4`, lastModified: NOW - 1000 },
  { key: `promo/${P1}/clip-1.mp4`, lastModified: 0 },
  { key: `_test/${P1}/demo.mp4`, lastModified: 0 },
  { key: `${U}/avatar.png`, lastModified: 0 },
  { key: `not-a-uuid/${P1}/demo.mp4`, lastModified: 0 },
]);
ok("작품 폴더 2개만", folders.length === 2, folders.map((f) => f.prefix).join(", "));
ok("promo/·_test/·사람 폴더 바로 아래 파일은 제외", !folders.some((f) => /^(promo|_test|not-a-uuid)\//.test(f.prefix)));
const f1 = folders.find((f) => f.projectId === P1)!;
ok("폴더 시각 = 가장 최근 파일", f1.newest === NOW - 2 * DAY);
ok("대문자 id도 소문자로 맞춤", groupProjectFolders([{ key: `${U}/${P1.toUpperCase()}/d.mp4`, lastModified: 0 }])[0].projectId === P1);

// (4)
ok("행이 있으면 안 지움", pickOrphans(folders, new Set([P1, P2]), NOW).length === 0);
const picked = pickOrphans(folders, new Set(), NOW);
ok("행이 없어도 하루 안 된 폴더는 안 지움", picked.length === 1 && picked[0].projectId === P1);
const many = Array.from({ length: R2_SWEEP_MAX_PREFIXES + 7 }, (_, i) => ({
  prefix: `${U}/p${i}/`, projectId: `p${i}`, newest: 0,
}));
ok(`한 번에 ${R2_SWEEP_MAX_PREFIXES}개까지`, pickOrphans(many, new Set(), NOW).length === R2_SWEEP_MAX_PREFIXES);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall r2-sweep checks passed");
