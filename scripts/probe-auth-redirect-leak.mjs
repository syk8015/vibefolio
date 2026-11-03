// 로그인 정보가 미리보기 도메인으로 새는 길(2026-11-03, 보안 5단계 S1-F8 높음) prod E2E.
// Supabase는 Site URL(nookframe.com)과 같은 호스트면 어떤 경로든 로그인 뒤 돌아갈 곳으로 받는다.
// 그래서 nookframe.com 안에서 남의 손에 닿는 곳으로 넘기는 주소는 쿼리(?code=)와 조각(#access_token)을
// 넘기지 않아야 한다.
//   (1) nookframe.com/api/preview/… → 미리보기 도메인 307: 쿼리를 버리고 Location이 `#`로 끝난다
//   (2) Supabase 허용 목록에 미리보기 도메인 항목이 없다(옛 vibefolio-beta → Site URL로 바뀜)
// 계정·쓰기 없음. (2)는 Supabase /authorize를 부르기만 하고(구글 화면까지 안 감) 결과를 읽기 전용 DB로 본다.
// 사용: node scripts/probe-auth-redirect-leak.mjs
import "./_secrets.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const ORIGIN = "https://nookframe.com";
let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// (1) 아무 uid·폴더 모양이면 된다 — 넘기기는 공개 여부를 보기 전에 일어난다.
const path = "/api/preview/00000000-0000-4000-8000-000000000000/00000000-0000-4000-8000-000000000001/index.html";
const r1 = await fetch(`${ORIGIN}${path}?code=probe-leak&next=x`, { redirect: "manual" });
const loc = r1.headers.get("location") ?? "";
ok("(1a) 메인 도메인 미리보기 → 307", r1.status === 307, String(r1.status));
ok("(1b) 쿼리를 넘기지 않음", !loc.includes("probe-leak") && !loc.includes("?"), loc);
ok("(1c) Location이 `#`로 끝남(조각 이어 붙이기 끊음)", loc.endsWith("#"), loc);

// (2) PKCE 흐름을 하나 열면 Supabase가 받아들인 돌아갈 곳이 auth.flow_state.referrer에 남는다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const tag = `probe-arl-${Date.now().toString(36)}`;
const challenge = createHash("sha256").update(`${tag}-verifier-xxxxxxxxxxxxxxxxxxxxxxxxxxxx`).digest("base64url");
const tries = {
  preview: `https://vibefolio-beta.vercel.app/auth/callback?next=/${tag}`,
  callback: `${ORIGIN}/auth/callback?next=/${tag}`,
};
for (const target of Object.values(tries)) {
  const q = new URLSearchParams({ provider: "google", code_challenge: challenge, code_challenge_method: "s256", redirect_to: target });
  await fetch(`${url}/auth/v1/authorize?${q}`, { redirect: "manual" });
}
let rows = "";
try {
  rows = execFileSync("bash", ["-c", `
    kc() { security find-generic-password -a "$USER" -s "$1" -w 2>/dev/null; }
    PGPASSWORD=$(kc nookframe-backup-db-password) PGSSLMODE=require /opt/homebrew/opt/libpq/bin/psql "$(kc nookframe-backup-db-url)" -X -q -At \\
      -c "set session characteristics as transaction read only" \\
      -c "select referrer from auth.flow_state where created_at > now() - interval '2 minutes' and (referrer like '%${tag}%' or referrer = 'https://nookframe.com')"
  `], { encoding: "utf8" });
} catch (e) {
  ok("(2) 읽기 전용 DB 접속", false, e instanceof Error ? e.message.split("\n")[0] : String(e));
}
if (rows) {
  const refs = rows.split("\n").filter(Boolean);
  ok("(2a) 미리보기 도메인 돌아갈 곳 → 거절", !refs.some((r) => r.includes("vibefolio-beta")), refs.join(" | "));
  ok("(2b) 정상 로그인 돌아갈 곳 /auth/callback?… → 받음", refs.includes(tries.callback));
}

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
