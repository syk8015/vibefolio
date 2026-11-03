// 알아채기·미끼(lib/tripwire.ts·lib/bait.ts) 순수 부분. `npm test`. 네트워크·진짜 비밀값 없음.
process.env.SUPABASE_SERVICE_ROLE_KEY = "probe-secret-not-real";
process.env.DECOY_IDS = "0A0A0A0A-0000-4000-8000-000000000001, nope";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";

const { parseDecoyHashes, TOKEN_BURST_MAX, ADMIN_BURST_MAX } = await import("../lib/tripwire");
const { baitTokenFrom, baitLabelOf, baitResponseBody, BAIT_ROUTES, BAIT_LABELS, parseDecoyIds, touchesDecoyId, ipKeyEdge } =
  await import("../lib/bait");
const { clientIpKeyFromHeaders } = await import("../lib/rate-limit");

const A = "a".repeat(64);
const B = "0123456789abcdef".repeat(4);
let n = 0, fail = 0;
const check = (name: string, pass: boolean) => { n++; if (!pass) { fail++; console.error(`✗ ${name}`); } };

// 숨긴 미끼 해시 목록
check("비었으면 빈 목록", parseDecoyHashes(undefined).size === 0 && parseDecoyHashes("").size === 0);
const m = parseDecoyHashes(` db:${A},mac:${B}\n`);
check("장소:해시 여럿", m.size === 2 && m.get(A) === "db" && m.get(B) === "mac");
check("장소 없이 해시만도 받음(?)", parseDecoyHashes(A).get(A) === "?");
check("대문자 해시도 소문자로", parseDecoyHashes(`db:${A.toUpperCase()}`).get(A) === "db");
check("64자 16진수 아닌 건 버림(원문 토큰을 잘못 넣어도 미끼가 안 됨)",
  parseDecoyHashes("nf_live_abc,db:xyz," + "g".repeat(64)).size === 0);
check("과사용 한도가 MCP 이중 계산을 감당(≥200)", TOKEN_BURST_MAX >= 200);
check("관리자 한도가 프로브 한 번(≈10)보다 넉넉", ADMIN_BURST_MAX >= 30);

// 겉 미끼 토큰
const t1 = await baitTokenFrom("s1", "env");
check("겉 미끼 토큰은 진짜 토큰 모양(nf_live_ + 43자)", /^nf_live_[A-Za-z0-9_-]{43}$/.test(t1));
check("같은 비밀값·이름 → 같은 토큰", t1 === (await baitTokenFrom("s1", "env")));
check("이름마다 다름", new Set(await Promise.all(BAIT_LABELS.map((l) => baitTokenFrom("s1", l)))).size === BAIT_LABELS.length);
check("비밀값이 바뀌면 다름", t1 !== (await baitTokenFrom("s2", "env")));
const envBody = await baitResponseBody("/.env");
const tokInEnv = /nf_live_[A-Za-z0-9_-]{43}/.exec(envBody?.body ?? "")?.[0] ?? "";
check("/.env 본문에 토큰이 있고 알아봄", !!tokInEnv && (await baitLabelOf(tokInEnv)) === "env");
check("진짜처럼 생긴 다른 토큰은 미끼 아님", (await baitLabelOf("nf_live_" + "x".repeat(43))) === null);
check("겉 미끼 주소 아니면 null", (await baitResponseBody("/dashboard")) === null && (await baitResponseBody("/.env/x")) === null);
check("/.git/config는 토큰 없음", !/nf_live_/.test((await baitResponseBody("/.git/config"))?.body ?? "x"));
check("모든 겉 미끼 주소가 내용을 냄", (await Promise.all(Object.keys(BAIT_ROUTES).map(baitResponseBody))).every(Boolean));
check("겉 미끼 본문에 진짜 서비스 키가 안 섞임",
  (await Promise.all(Object.keys(BAIT_ROUTES).map(baitResponseBody))).every((r) => !r!.body.includes("probe-secret-not-real")));

// 숨긴 미끼 id
check("DECOY_IDS — uuid만", parseDecoyIds("x, 0a0a0a0a-0000-4000-8000-000000000001").length === 1);
check("주소에 미끼 id(대소문자 무관)", touchesDecoyId("/api/preview/u/0a0a0a0a-0000-4000-8000-000000000001/index.html"));
check("쿼리·인코딩 속 미끼 id", touchesDecoyId("/api/ingest/status?id=0a0a0a0a%2D0000-4000-8000-000000000001"));
check("다른 id는 아님", !touchesDecoyId("/api/ingest/status?id=0a0a0a0a-0000-4000-8000-000000000002"));

// IP 표식 — Edge 판이 Node 판과 같아야 막힘 확인이 맞는다
const h = new Headers({ "x-vercel-forwarded-for": "203.0.113.7" });
check("IP 표식 Edge == Node", (await ipKeyEdge(h)) === clientIpKeyFromHeaders(h));

if (fail) { console.error(`tripwire: ${fail}/${n}건 실패`); process.exit(1); }
console.log(`✓ tripwire: ${n}건`);
