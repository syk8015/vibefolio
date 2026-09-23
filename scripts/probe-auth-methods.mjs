// 로그인 수단(2026-09-23: GitHub · 메일 6자리 코드) prod E2E. 실제 메일은 보내지 않는다.
//
// 코드는 대시보드 설정에 기대고 있어서, 대시보드가 바뀌면 조용히 깨진다 — 그걸 잡는 찔러보기다.
// (1) 공급자 켜짐: email·google·github (/auth/v1/settings)
// (2) GitHub 인가 주소가 github.com으로 가고 콜백이 Supabase 주소
// (3) 코드 길이 = components/EmailCodeForm.tsx의 OTP_LENGTH (대시보드 기본값은 8이었다)
// (4) 새 주소 → 코드 확인(type "email") → 세션 + 메일 인증됨 (새 계정 = Confirm signup 경로)
// (5) 틀린 코드는 거절
// (6) 이미 있는 계정 → 코드로 다시 로그인 (Magic link 경로)
// (7) 비밀번호 가입 후 미인증 계정 → 가입 메일의 코드로 인증 (가입 "메일 확인" 화면의 코드 칸)
//
// 사용: 레포 루트에서 `node scripts/probe-auth-methods.mjs`
// 관리자 generateLink로 코드를 받으니 메일 발송 한도(Resend)를 안 쓴다. 코드 확인은
// IP당 5분 30회 한도에서 5회 쓴다. 만든 임시 계정은 끝에 지운다.
import "./_secrets.mjs";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// 확인할 때마다 새 클라이언트 — 앞 단계의 세션이 다음 단계에 섞이지 않게.
const anon = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

const OTP_LENGTH = Number(
  readFileSync(new URL("../components/EmailCodeForm.tsx", import.meta.url), "utf8")
    .match(/export const OTP_LENGTH = (\d+)/)?.[1],
);

{
  const r = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: ANON } });
  const ext = (await r.json().catch(() => ({}))).external ?? {};
  for (const p of ["email", "google", "github"]) ok(`공급자 켜짐: ${p}`, ext[p] === true, `external.${p}=${ext[p]}`);
}

{
  const redirect = "https://nookframe.com/auth/callback?next=/dashboard";
  const r = await fetch(
    `${URL_}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirect)}`,
    { headers: { apikey: ANON }, redirect: "manual" },
  );
  const loc = r.headers.get("location") ?? "";
  const u = loc ? new URL(loc) : null;
  ok("GitHub 인가 → github.com", r.status >= 300 && r.status < 400 && u?.host === "github.com", `${r.status} ${u?.host ?? loc}`);
  ok("GitHub client_id 있음", !!u?.searchParams.get("client_id"));
  ok(
    "GitHub 콜백 = Supabase /auth/v1/callback",
    u?.searchParams.get("redirect_uri") === `${URL_}/auth/v1/callback`,
    u?.searchParams.get("redirect_uri"),
  );
}

const made = [];
const email = (tag) => `nf-probe-${tag}-${Date.now()}@example.com`;
const codeFor = async (params) => {
  const { data, error } = await svc.auth.admin.generateLink(params);
  if (data?.user?.id && !made.includes(data.user.id)) made.push(data.user.id);
  return { otp: data?.properties?.email_otp ?? "", type: data?.properties?.verification_type, error };
};

try {
  // (3)(4) 새 주소 — 앱은 signInWithOtp(shouldCreateUser)로 만들고 Confirm signup 메일이 간다.
  const fresh = email("otp-new");
  {
    const { otp, type, error } = await codeFor({ type: "magiclink", email: fresh });
    ok("새 주소에 코드 발급", !error && !!otp, error?.message ?? `type=${type}`);
    ok(`코드 길이 = OTP_LENGTH(${OTP_LENGTH})`, otp.length === OTP_LENGTH, `받은 길이 ${otp.length} — 대시보드 Email OTP length를 맞출 것`);

    const wrong = otp ? String((Number(otp[0]) + 1) % 10) + otp.slice(1) : "000000";
    const bad = await anon().auth.verifyOtp({ email: fresh, token: wrong, type: "email" });
    ok("틀린 코드는 거절", !!bad.error && !bad.data?.session, bad.error?.message);

    const good = await anon().auth.verifyOtp({ email: fresh, token: otp, type: "email" });
    ok("새 주소: 코드로 로그인", !good.error && !!good.data?.session, good.error?.message);
    ok("새 주소: 메일 인증됨", !!good.data?.user?.email_confirmed_at);
    // 미들웨어 온보딩 표식(user_metadata.username)이 코드 경로로 생기면 온보딩을 건너뛴다.
    ok("새 주소: username 표식 없음(온보딩으로 간다)", !good.data?.user?.user_metadata?.username);
  }

  // (6) 같은 주소로 한 번 더 — 이제 인증된 계정이라 Magic link 경로.
  {
    const { otp, type, error } = await codeFor({ type: "magiclink", email: fresh });
    const r = await anon().auth.verifyOtp({ email: fresh, token: otp, type: "email" });
    ok("기존 계정: 코드로 다시 로그인", !error && !r.error && !!r.data?.session, error?.message ?? r.error?.message ?? `type=${type}`);
  }

  // (7) 비밀번호 가입 → 미인증 → 가입 메일 속 코드로 인증.
  {
    const pw = email("otp-pw");
    const { otp, error } = await codeFor({ type: "signup", email: pw, password: `Probe-${Date.now()}-pw` });
    const r = await anon().auth.verifyOtp({ email: pw, token: otp, type: "email" });
    ok(
      "비밀번호 가입: 가입 메일 코드로 인증",
      !error && !r.error && !!r.data?.user?.email_confirmed_at,
      error?.message ?? r.error?.message,
    );
  }
} finally {
  for (const id of made) {
    const { error } = await svc.auth.admin.deleteUser(id);
    if (error) console.error(`임시 계정 삭제 실패 ${id}: ${error.message}`);
  }
  console.log(`(임시 계정 ${made.length}개 삭제)`);
}

if (failed) {
  console.error(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n전부 통과");
