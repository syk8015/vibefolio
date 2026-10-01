// 가입 도중 [계정 지우기](app/onboarding) prod E2E — 아이디를 정하지 않은 계정이 스스로 지워지는지.
//
// 검증: (1) 로그인 없이 DELETE /api/account → 401
// (2) 아이디 없는 계정은 /dashboard에서 /onboarding으로 돌려보내진다(설정의 회원 탈퇴에 못 감)
// (3) 온보딩 화면에 [계정 지우기] → 확인 창에 계정 메일이 보임 → [계정 지우기]를 누르면 첫 화면으로
// (4) 계정이 실제로 사라짐(auth.users에 없음)
//
// 계정은 사람에게 메일이 안 가는 주소로 잠깐 만들었다가, 실패하면 finally에서 지운다.
// 사용: 레포 루트에서 `node scripts/probe-onboarding-quit.mjs` (SHOTS=<폴더>면 확인 창을 찍어 둔다)
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { chromium } from "playwright-core";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const SHOTS = process.env.SHOTS;
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

{
  const res = await fetch(`${ORIGIN}/api/account`, { method: "DELETE" });
  ok("(1) 로그인 없이 DELETE /api/account → 401", res.status === 401, `${res.status}`);
}

const EMAIL = `probe-quit-${Date.now()}@example.invalid`;
let uid = null;
let browser = null;
try {
  // 구글로 막 들어와 아이디를 아직 안 정한 사람 — metadata에 username이 없다.
  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email: EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "Probe Quit" },
  });
  if (cErr) throw cErr;
  uid = created.user.id;
  const { data: link, error: lErr } = await svc.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  if (lErr) throw lErr;
  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: sess, error: vErr } = await userClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (vErr) throw vErr;
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const chunks = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)));

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ locale: "ko-KR" });
  await ctx.addCookies(chunks.map((c) => ({ name: c.name, value: c.value, url: ORIGIN })));
  const page = await ctx.newPage();

  await page.goto(`${ORIGIN}/dashboard`, { waitUntil: "networkidle" });
  ok("(2) 아이디 없는 계정은 /onboarding으로 돌려보내짐", new URL(page.url()).pathname === "/onboarding", page.url());

  const link1 = page.getByRole("button", { name: /^(계정 지우기|Delete account)$/ });
  await link1.waitFor({ timeout: 15000 });
  ok("(3) 온보딩 화면에 [계정 지우기]가 있음", (await link1.count()) === 1);
  await link1.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ timeout: 5000 });
  ok("(3) 확인 창에 계정 메일이 보임", (await dialog.textContent())?.includes(EMAIL) ?? false);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/onboarding-quit-dialog.png` });

  await dialog.getByRole("button", { name: /^(계정 지우기|Delete account)$/ }).click();
  await page.waitForURL((u) => u.pathname === "/", { timeout: 30000 });
  ok("(3) 지운 뒤 첫 화면으로 감", new URL(page.url()).pathname === "/", page.url());

  const { data: after } = await svc.auth.admin.getUserById(uid);
  ok("(4) 계정이 실제로 사라짐", !after?.user, after?.user?.id ?? "gone");
  if (!after?.user) uid = null;
} catch (err) {
  ok("probe 실행", false, err?.message ?? err);
} finally {
  if (browser) await browser.close();
  if (uid) await svc.auth.admin.deleteUser(uid);
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall onboarding-quit probes passed");
process.exit(failed ? 1 : 0);
