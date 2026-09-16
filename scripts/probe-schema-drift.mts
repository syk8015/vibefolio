// 생성물이 원본과 어긋났는지 — 즉 누가 생성물을 손으로 고쳤는지 검사한다(2026-09-17).
//
// 설명서(발행 payload의 필드·규칙)는 schema/publish.json 한 장이 원본이고, 거기서
// cli/src/schema.js가 생성된다. 생성물을 손으로 고치면 그 순간 사본이 둘로 갈라지고,
// "검사에선 통과라더니 발행에선 거절"이 시작된다. 이 프로브가 그걸 커밋 전에 막는다.
//
// 네트워크를 안 탄다 — 생성기를 import해서 문자열만 비교한다(파일은 안 쓴다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
// `.mjs`로 쓴다 — TS는 이 확장자를 `.mts` 소스로 풀고, tsx도 같은 파일을 찾는다
// (`.mts`를 그대로 쓰면 allowImportingTsExtensions가 필요해진다).
import { GENERATED } from "./build-schema.mjs";

const ROOT = join(import.meta.dirname, "..");
let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

for (const [rel, expected] of Object.entries(GENERATED)) {
  let actual = "";
  try {
    actual = readFileSync(join(ROOT, rel), "utf8");
  } catch {
    ok(`${rel} 존재`, false, "파일이 없습니다 — npm run schema:build");
    continue;
  }
  if (actual === expected) {
    ok(`${rel} = 원본에서 생성한 그대로`, true);
    continue;
  }
  // 어디가 다른지 첫 줄만 짚어 준다 — 전문을 쏟으면 무엇이 문제인지 안 보인다.
  const a = actual.split("\n");
  const e = expected.split("\n");
  const i = a.findIndex((line, n) => line !== e[n]);
  ok(`${rel} = 원본에서 생성한 그대로`, false,
    `${i + 1}번째 줄부터 다릅니다. 원본(schema/publish.json)을 고치고 npm run schema:build 하세요.\n` +
    `  디스크: ${JSON.stringify(a[i]?.slice(0, 80))}\n  생성물: ${JSON.stringify(e[i]?.slice(0, 80))}`);
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
