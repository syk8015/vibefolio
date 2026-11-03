// 촬영 대기열 게이트(2026-11-03, 5단계 낮음 — supabase/migration_request_demo_gate.sql) prod E2E.
//   (1) 사용자 키로 request_demo()를 바로 불러도 초안 → NOT_PUBLIC · 내린 작품 → NOT_PUBLIC, 행은 pending이 안 됨
//   (2) 익명 키로는 실행 권한이 없음
//   (3) 예약 아이디(send·intro-render·security)로 명함을 못 만든다(DB 제약)
//   (4) 대조: 공개 작품은 그대로 대기열에 들어간다(pending) — 끝에 되돌린다(촬영은 batch 모드라 돌지 않음)
// 일회용 계정 하나로만, 끝에 계정째 지운다.
// 사용: node scripts/probe-request-demo-gate.mjs
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, ANON, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const tag = Date.now().toString(36);
let uid = null;
try {
  const { data: tu, error } = await svc.auth.admin.createUser({ email: `vivestarter+probe-rdg-${tag}@gmail.com`, email_confirm: true });
  if (error) throw error;
  uid = tu.user.id;
  await svc.from("profiles").insert({ id: uid, username: `proberdg${tag}`, name: "probe" });
  const mk = async (title, extra) => {
    const { data, error: e } = await svc.from("projects").insert({
      user_id: uid, title: `__probe_rdg_DONOTKEEP__ ${title}`, description: "", demo_url: "https://example.com/", ...extra,
    }).select("id").single();
    if (e) throw new Error(`insert: ${e.message}`);
    return data.id;
  };
  const draft = await mk("초안", { is_draft: true });
  const down = await mk("내림", { is_draft: true, taken_down_at: new Date().toISOString() });
  const pub = await mk("공개", { is_draft: false });

  const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email: tu.user.email });
  const { data: sess } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  const user = createClient(url, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${sess.session.access_token}` } } });
  const call = (c, id) => c.rpc("request_demo", { p_project_id: id, p_source_type: "live_url", p_source_value: "https://example.com/" });

  for (const [name, id] of [["초안", draft], ["내린 작품", down]]) {
    const r = await call(user, id);
    ok(`(1) ${name} → NOT_PUBLIC`, r.data?.code === "NOT_PUBLIC", r.error?.message ?? JSON.stringify(r.data));
  }
  const { data: rows } = await svc.from("projects").select("demo_build_status").in("id", [draft, down]);
  ok("(1') 초안·내린 작품이 대기열에 안 들어감", (rows ?? []).every((x) => x.demo_build_status !== "pending"), (rows ?? []).map((x) => x.demo_build_status).join(","));
  // 새 익명 클라이언트로 — 위의 anon은 verifyOtp로 세션을 들고 있다.
  const a = await call(createClient(url, ANON, { auth: { persistSession: false } }), pub);
  ok("(2) 익명 키 실행 → 권한 없음", !!a.error, a.error?.code ?? JSON.stringify(a.data));
  for (const name of ["send", "intro-render", "security"]) {
    const r = await svc.from("profiles").update({ username: name }).eq("id", uid).select("id");
    ok(`(3) 예약 아이디 '${name}' → 막힘`, !!r.error, r.error?.code ?? "바뀜");
  }
  const p = await call(user, pub);
  ok("(4) 대조: 공개 작품은 pending", p.data?.status === "pending", p.error?.message ?? JSON.stringify(p.data));
  await svc.from("projects").update({ demo_build_status: null }).in("id", [draft, down, pub]);
  await svc.from("demo_events").delete().eq("user_id", uid);
} catch (e) {
  ok("예외", false, e instanceof Error ? e.message : String(e));
} finally {
  if (uid) {
    await svc.from("demo_events").delete().eq("user_id", uid);
    const { error } = await svc.auth.admin.deleteUser(uid);
    ok("끝 — 일회용 계정 지움", !error, error?.message ?? "");
  }
}
console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
