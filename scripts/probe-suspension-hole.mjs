// 정지·내리기를 지웠다 다시 만들어 푸는 구멍(2026-11-02, supabase/migration_suspension_hole.sql — audit-6 F1·F2) prod E2E.
// 조건: SQL 적용 + 배포 뒤. 일회용 계정 하나로(진짜 계정은 안 건드림):
//   (1) 정지된 사람이 사용자 키로 자기 명함 행을 지우지 못한다 → 정지가 그대로 남는다 · 익명 키도 못 지운다
//   (2) 사용자 키로 projects에 새 행을 못 넣는다 · 기본값은 초안
//   (3) 내린 작품은 못 지운다 — 사용자 키 직접 · 대시보드 삭제 길(409 TAKEN_DOWN, 파일도 안 지움) ·
//       인제스트 초안 삭제 길(PAT, 409)
//   (4) 평소 일은 그대로 — 내리지 않은 작품 삭제 200 · 명함 고치기
//   끝: 일회용 계정 지움(행·토큰은 함께 지워진다)
// 사용: node scripts/probe-suspension-hole.mjs
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const MARK = "__probe_suspension_DONOTKEEP__";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const rowExists = async (table, id) => !!(await svc.from(table).select("id").eq("id", id).maybeSingle()).data;

const tag = Date.now().toString(36);
let uid = null;
try {
  const { data: tu, error: tuErr } = await svc.auth.admin.createUser({
    email: `vivestarter+probe-sh-${tag}@gmail.com`, email_confirm: true,
  });
  if (tuErr) throw new Error(`createUser: ${tuErr.message}`);
  uid = tu.user.id;
  const { error: pErr } = await svc.from("profiles").insert({ id: uid, username: `probesh${tag}`, name: "probe" });
  if (pErr) throw new Error(`profile insert: ${pErr.message}`);
  const mk = async (title, extra) => {
    const { data, error } = await svc.from("projects").insert({
      user_id: uid, title: `${MARK} ${title}`, description: "", demo_url: "https://example.com/", ...extra,
    }).select("id").single();
    if (error) throw new Error(`project insert: ${error.message}`);
    return data.id;
  };
  const now = new Date().toISOString();
  const downPub = await mk("내린 작품", { is_draft: true, taken_down_at: now });
  const downDraft = await mk("내린 초안", { is_draft: true, taken_down_at: now });
  const normal = await mk("평범한 작품", { is_draft: false });
  await svc.from("profiles").update({ suspended_at: now }).eq("id", uid);

  // 일회용 계정 세션 → 사용자 키 + 쿠키
  const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email: tu.user.email });
  const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (otpErr) throw new Error(`verifyOtp: ${otpErr.message}`);
  const user = createClient(url, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } },
  });
  const ref = new URL(url).hostname.split(".")[0];
  const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
    .map((c) => `${c.name}=${c.value}`).join("; ");

  // (1)
  const d1 = await user.from("profiles").delete().eq("id", uid).select("id");
  const { data: prof } = await svc.from("profiles").select("suspended_at").eq("id", uid).maybeSingle();
  ok("(1a) 정지된 사람이 자기 명함 행 지우기 → 막힘", !!prof, d1.error?.message ?? `${d1.data?.length ?? 0}행 지움`);
  ok("(1b) 정지가 그대로 남음", !!prof?.suspended_at);
  await anon.from("profiles").delete().eq("id", uid);
  ok("(1c) 익명 키로도 못 지움", await rowExists("profiles", uid));

  // (2)
  const ins = await user.from("projects").insert({ user_id: uid, title: `${MARK} 다시 넣기`, demo_url: "https://example.com/" }).select("id");
  if (!ins.error && ins.data?.[0]?.id) await svc.from("projects").delete().eq("id", ins.data[0].id);
  ok("(2a) 사용자 키로 새 작품 넣기 → 막힘", !!ins.error, ins.error?.message ?? "들어감");
  const { data: dflt } = await svc.from("projects").insert({ user_id: uid, title: `${MARK} 기본값`, demo_url: "https://example.com/" })
    .select("id, is_draft").single();
  ok("(2b) is_draft 기본값 = 초안", dflt?.is_draft === true, String(dflt?.is_draft));
  if (dflt?.id) await svc.from("projects").delete().eq("id", dflt.id);

  // (3)
  await user.from("projects").delete().eq("id", downPub);
  ok("(3a) 내린 작품 — 사용자 키로 직접 지우기 → 남음", await rowExists("projects", downPub));
  const r3 = await fetch(`${ORIGIN}/api/projects/${downPub}/demo-assets`, { method: "DELETE", headers: { Cookie: cookie } });
  const b3 = await r3.json().catch(() => ({}));
  ok("(3b) 내린 작품 — 대시보드 삭제 → 409 TAKEN_DOWN", r3.status === 409 && b3.code === "TAKEN_DOWN", `${r3.status} ${b3.code ?? ""}`);
  ok("(3b') 행이 남음", await rowExists("projects", downPub));
  const tr = await fetch(`${ORIGIN}/api/tokens`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ name: "probe" }),
  });
  const tb = await tr.json().catch(() => ({}));
  if (tr.ok && tb.token) {
    const r4 = await fetch(`${ORIGIN}/api/ingest/drafts/${downDraft}`, { method: "DELETE", headers: { Authorization: `Bearer ${tb.token}` } });
    const b4 = await r4.json().catch(() => ({}));
    ok("(3c) 내린 초안 — 인제스트 삭제(PAT) → 409 TAKEN_DOWN", r4.status === 409 && b4.code === "TAKEN_DOWN", `${r4.status} ${b4.code ?? ""}`);
    ok("(3c') 행이 남음", await rowExists("projects", downDraft));
  } else {
    ok("(3c) PAT 발급", false, `${tr.status} ${tb.code ?? ""}`);
  }

  // (4)
  const r5 = await fetch(`${ORIGIN}/api/projects/${normal}/demo-assets`, { method: "DELETE", headers: { Cookie: cookie } });
  ok("(4a) 내리지 않은 작품 삭제 → 200 · 행 사라짐", r5.status === 200 && !(await rowExists("projects", normal)), String(r5.status));
  const up = await user.from("profiles").update({ bio: "probe" }).eq("id", uid).select("id");
  ok("(4b) 명함 고치기는 그대로", !up.error && up.data?.length === 1, up.error?.message ?? "");
} catch (err) {
  ok("예외", false, err instanceof Error ? err.message : String(err));
} finally {
  if (uid) {
    const { error } = await svc.auth.admin.deleteUser(uid);
    ok("끝 — 일회용 계정 지움", !error && !(await rowExists("profiles", uid)), error?.message ?? "");
  }
}

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
