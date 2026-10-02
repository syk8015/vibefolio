// 작은 구멍 묶음(2026-10-02, 위협 목록 M급). 네트워크 없음.
// 지키는 것: 유입 주소는 "https://호스트"만 받는다(가짜 유입처·경로 속 남의 정보) ·
// 소셜 배지는 맨 앞 www.만 떼고 http(s) 링크만 단다(남의 주소에 인스타그램 배지).
// 프로필·작품 글자 길이 상한은 데이터 저장소 쪽(supabase/migration_length_caps.sql)이라 여기선 SQL 문구만 본다.
import { readFileSync } from "node:fs";
import { cleanReferrer, classifyTrafficSource } from "../lib/traffic-source";
import { getSocialMeta } from "../components/SocialBadge";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const ref = (raw: unknown, want: string | null) => {
  const got = cleanReferrer(raw);
  const shown = JSON.stringify(raw) ?? String(raw);
  ok(`유입 ${shown.length > 70 ? `${shown.slice(0, 40)}…(${shown.length}자)` : shown} → ${want}`, got === want, String(got));
};

// 유입 주소 — 남기는 것
ref("https://www.threads.net/@a/post/1?token=abc", "https://www.threads.net");
ref("https://l.instagram.com/?u=https%3A%2F%2Fnookframe.com&e=me@x.com", "https://l.instagram.com");
ref("http://localhost:3000/dashboard", "http://localhost");
ref("https://Example.COM/x", "https://example.com");
// 유입 주소 — 버리는 것
ref("javascript:alert(1)", null);
ref("data:text/html,hi", null);
ref("FREE MONEY click here", null);
ref("https://intranet/x", null);
ref("", null);
ref(42, null);
ref(`https://${"a".repeat(3000)}.com`, null);
// 분류는 다듬은 값으로도 그대로
ok("다듬은 Threads 주소도 Threads로 분류", classifyTrafficSource({ referrer: cleanReferrer("https://l.threads.net/x?y=1") }) === "Threads");

// 소셜 배지
const badge = (url: string) => getSocialMeta(url);
ok("www.instagram.com → 인스타그램 배지", badge("https://www.instagram.com/someone")?.name === "Instagram", badge("https://www.instagram.com/someone")?.name);
ok("instagram.com (https 생략) → 배지, 링크는 https", badge("instagram.com/someone")?.href === "https://instagram.com/someone");
ok("instagram.www.com → 배지 없음(남의 주소)", badge("https://instagram.www.com/x") === null);
ok("instawww.gram.com → 배지 없음", badge("https://instawww.gram.com/x") === null);
ok("javascript: → 배지 없음", badge("javascript:alert(1)//instagram.com") === null);
ok("ftp: → 배지 없음", badge("ftp://instagram.com/x") === null);

// 길이 상한 SQL — 기존 줄은 안 건드리고(not valid) 새로 쓰는 값만 막는다
const sql = readFileSync(new URL("../supabase/migration_length_caps.sql", import.meta.url), "utf8");
const checks = sql.match(/add constraint/gi)?.length ?? 0;
const notValid = sql.match(/\) not valid;/gi)?.length ?? 0;
ok("길이 상한 SQL — 제약마다 not valid", checks > 0 && checks === notValid, `${checks}개 제약, not valid ${notValid}`);

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n전부 통과");
