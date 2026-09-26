// 로그인 방법 연결(2026-09-25, 09-26부터 설정 화면 "로그인 방법") prod E2E. 구글·깃허브 화면까지는 안 간다.
//
// (1) Supabase "Allow manual linking" 켜짐 — 로그인한 임시 계정으로 연결 주소를 받아 본다.
//     꺼져 있으면 404 manual_linking_disabled라 앱의 [연결]이 "연결을 시작하지 못했어요"로 끝난다.
//     앱이 싣는 prompt=select_account(계정 고르는 창)가 구글·깃허브 주소까지 전달되는지도 본다.
// (2) 방법이 하나뿐인 계정의 해제는 거절(single_identity_not_deletable) — 앱은 버튼부터 안 보인다.
// (3) 콜백(/auth/callback)이 연결 왕복의 결과를 설정 화면에 싣는다(lib/identityLink): 남의 계정 →
//     taken, 취소·코드 교환 실패 → failed. 연결이 아닌 로그인 실패는 예전 그대로 /login?error=oauth.
// (4) 설정 화면은 로그인해야 열린다 — 비로그인은 /login?next=/settings로.
//
// 사용: 레포 루트에서 `node scripts/probe-identity-linking.mjs` — (3)은 배포된 콜백을 본다.
// 다른 주소를 보려면 PROBE_SITE=https://… . 만든 임시 계정은 끝에 지운다.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SITE = process.env.PROBE_SITE ?? "https://nookframe.com";
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

const RETURN_PATH = "/settings";
const linkBack = (provider) =>
  `${SITE}/auth/callback?link=1&next=${encodeURIComponent(RETURN_PATH)}&via=${provider}`;

const made = [];
try {
  // 임시 계정 — 관리자가 받은 메일 코드로 바로 로그인(보안 확인·메일 발송 없이). 처음 보는
  // 주소라 이 링크가 계정을 만든다 — 확인 종류는 "email"(가입·로그인 코드 공용, probe-auth-methods와 같다).
  const email = `nf-probe-link-${Date.now()}@example.com`;
  const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (link?.user?.id) made.push(link.user.id);
  const user = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: sess, error: otpErr } = link
    ? await user.auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" })
    : { data: null, error: linkErr };
  const jwt = sess?.session?.access_token;
  ok("임시 계정 로그인", !!jwt, (linkErr ?? otpErr)?.message);

  if (jwt) {
    // (1) 연결 주소 — supabase-js linkIdentity가 부르는 것과 같은 주소(skip_http_redirect=true면 JSON).
    for (const [provider, host] of [["github", "github.com"], ["google", "accounts.google.com"]]) {
      const r = await fetch(
        `${URL_}/auth/v1/user/identities/authorize?provider=${provider}` +
          `&redirect_to=${encodeURIComponent(linkBack(provider))}&prompt=select_account&skip_http_redirect=true`,
        { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } },
      );
      const body = await r.json().catch(() => ({}));
      if (body.error_code === "manual_linking_disabled") {
        ok(`연결 켜짐(${provider})`, false, "Supabase → Authentication → Sign In / Providers → Allow manual linking 을 켤 것");
        continue;
      }
      const u = body.url ? new URL(body.url) : null;
      ok(`연결 주소 → ${host} (${provider})`, r.ok && u?.host === host, `${r.status} ${u?.host ?? JSON.stringify(body)}`);
      ok(`계정 고르는 창 요청 전달(${provider})`, u?.searchParams.get("prompt") === "select_account", u?.searchParams.get("prompt") ?? "(없음)");
    }

    // (2) 하나뿐인 방법(이메일)은 뗄 수 없다.
    const { data: ids } = await user.auth.getUserIdentities();
    const only = ids?.identities ?? [];
    ok("임시 계정 방법 = 이메일 하나", only.length === 1 && only[0].provider === "email", only.map((i) => i.provider).join(","));
    if (only[0]) {
      const r = await fetch(`${URL_}/auth/v1/user/identities/${only[0].identity_id}`, {
        method: "DELETE",
        headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
      });
      const body = await r.json().catch(() => ({}));
      ok("하나뿐인 방법 해제 거절", r.status === 422 && body.error_code === "single_identity_not_deletable", `${r.status} ${body.error_code ?? ""}`);
    }
  }
} finally {
  for (const id of made) {
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) console.error(`임시 계정 삭제 실패 ${id}: ${error.message}`);
  }
  console.log(`(임시 계정 ${made.length}개 삭제)`);
}

// (3) 콜백 — 계정이 필요 없다(결과 싣기는 코드 교환 전에 갈린다).
{
  const back = `${SITE}${RETURN_PATH}`;
  const cb = async (qs) => {
    const r = await fetch(`${SITE}/auth/callback?${qs}`, { redirect: "manual" });
    return r.headers.get("location") ?? `(status ${r.status}, location 없음)`;
  };
  const LINK = `link=1&next=${encodeURIComponent(RETURN_PATH)}&via=github`;
  const desc = (s) => `error_description=${encodeURIComponent(s)}`;

  let loc = await cb(`${LINK}&error=server_error&error_code=identity_already_exists&${desc("Identity is already linked to another user")}`);
  ok("콜백: 남의 계정에 붙은 깃허브 → 설정 link=taken", loc === `${back}?link=taken&provider=github`, loc);

  loc = await cb(`${LINK}&error=access_denied&${desc("The user has denied your application access.")}`);
  ok("콜백: 공급자 화면에서 취소 → 설정 link=failed", loc === `${back}?link=failed&provider=github`, loc);

  loc = await cb(`${LINK}&code=00000000-0000-0000-0000-000000000000`);
  ok("콜백: 코드 교환 실패 → 설정 link=failed", loc === `${back}?link=failed&provider=github`, loc);

  loc = await cb(`next=${encodeURIComponent("/dashboard")}&via=github&error=access_denied`);
  const lu = loc.startsWith("http") ? new URL(loc) : null;
  ok("콜백: 연결이 아닌 로그인 실패는 그대로 /login?error=oauth", lu?.pathname === "/login" && lu.searchParams.get("error") === "oauth", loc);
}

// (4) 설정 화면 — 비로그인이면 로그인으로(돌아올 곳을 싣고).
{
  const r = await fetch(`${SITE}/settings`, { redirect: "manual" });
  const loc = r.headers.get("location") ?? "";
  const lu = loc ? new URL(loc, SITE) : null;
  ok("설정: 비로그인 → /login?next=/settings", r.status >= 300 && r.status < 400 && lu?.pathname === "/login" && lu.searchParams.get("next") === "/settings", `${r.status} ${loc}`);
}

if (failed) {
  console.error(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n전부 통과");
