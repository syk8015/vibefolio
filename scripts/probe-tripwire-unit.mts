// 알아채기·미끼(lib/tripwire.ts) 순수 부분 — 미끼 해시 목록 읽기. `npm test`.
import { parseDecoyHashes, TOKEN_BURST_MAX, ADMIN_BURST_MAX } from "../lib/tripwire";

const A = "a".repeat(64);
const B = "0123456789abcdef".repeat(4);
let fail = 0;
const check = (name: string, pass: boolean) => { if (!pass) { fail++; console.error(`✗ ${name}`); } };

check("비었으면 빈 목록", parseDecoyHashes(undefined).size === 0 && parseDecoyHashes("").size === 0);
check("쉼표·공백·줄바꿈으로 여럿", parseDecoyHashes(` ${A},${B}\n`).size === 2);
check("대문자도 소문자로", parseDecoyHashes(A.toUpperCase()).has(A));
check("64자 16진수 아닌 건 버림(원문 토큰을 잘못 넣어도 그 토큰이 미끼가 되지 않음)",
  parseDecoyHashes("nf_live_abc,xyz," + "g".repeat(64)).size === 0);
check("과사용 한도가 MCP 이중 계산을 감당(≥200)", TOKEN_BURST_MAX >= 200);
check("관리자 한도가 프로브 한 번(≈10)보다 넉넉", ADMIN_BURST_MAX >= 30);

if (fail) { console.error(`tripwire: ${fail}건 실패`); process.exit(1); }
console.log("✓ tripwire: 6건");
