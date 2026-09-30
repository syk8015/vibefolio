// 연결 창 "AI가 작업을 시작했어요" 판정(네트워크 없음) — lib/connectActivity.ts.
// 사용: `npx -y tsx scripts/probe-connect-activity-unit.mts`
// 실서버 쪽은 로그인 쿠키가 필요한 주소라, 배포 뒤 로그인 없이 부르면 401인지만 본다.
import { latestActivity, aiStarted } from "../lib/connectActivity";

let failed = 0;
const ok = (name: string, pass: boolean) => {
  console.log(`${pass ? "✓" : "✗"} ${name}`);
  if (!pass) failed++;
};

const A = "2026-09-30T10:00:00.000Z";
const B = "2026-09-30T10:00:05.000Z";
ok("흔적 없음 → null", latestActivity([null, undefined]) === null);
ok("늦은 쪽을 고른다", latestActivity([A, B]) === B && latestActivity([B, A]) === B);
ok("이상한 값은 버린다", latestActivity(["nope", A]) === A);
ok("기준점 뒤 새 흔적 → 시작", aiStarted(A, B));
ok("기준점 그대로 → 아직", !aiStarted(A, A));
ok("흔적 없음 → 아직", !aiStarted(A, null) && !aiStarted(null, null));
ok("흔적이 전혀 없던 계정에 첫 흔적 → 시작", aiStarted(null, A));

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall connect-activity checks passed");
