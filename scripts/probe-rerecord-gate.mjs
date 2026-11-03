// 재촬영 바로 실행(apply-rerecord) 게이트 + 대시보드 서명의 비밀 파일 거르기(2026-11-03, 보안 5단계 S5-F1·S3-F5) prod E2E.
//   (1) 초안 → 409 DRAFT_NOT_PUBLISHED · 공개됐지만 안 찍힘 → 409 NOT_FILMED · 한도 보류(held) → 409 NOT_FILMED
//   (1') 어느 경우에도 행은 pending이 안 되고 촬영 기록(demo_events)도 안 생긴다
//   (2) 비밀 파일 서명 → 400 SECRET_FILE (config/master.key · .dev.vars · terraform.tfvars · wp-config.php), 보통 파일은 200
// 일회용 계정 하나로만(행은 서비스 키로 만들고 끝에 계정째 지운다). 촬영·메일은 일어나지 않는다.
// 사용: node scripts/probe-rerecord-gate.mjs
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const tag = Date.now().toString(36);
let uid = null;
try {
  const { data: tu, error: tuErr } = await svc.auth.admin.createUser({
    email: `vivestarter+probe-rr-${tag}@gmail.com`, email_confirm: true,
  });
  if (tuErr) throw new Error(`createUser: ${tuErr.message}`);
  uid = tu.user.id;
  const { error: pErr } = await svc.from("profiles").insert({ id: uid, username: `proberr${tag}`, name: "probe" });
  if (pErr) throw new Error(`profile insert: ${pErr.message}`);
  const script = { steps: [{ action: "wait", ms: 500 }] };
  const mk = async (title, extra) => {
    const { data, error } = await svc.from("projects").insert({
      user_id: uid, title: `__probe_rerecord_DONOTKEEP__ ${title}`, description: "", demo_url: "https://example.com/",
      pending_demo_script: script, ...extra,
    }).select("id").single();
    if (error) throw new Error(`project insert: ${error.message}`);
    return data.id;
  };
  const draft = await mk("초안", { is_draft: true });
  const unfilmed = await mk("안 찍힘", { is_draft: false });
  const held = await mk("보류", { is_draft: false, demo_build_status: "held" });

  const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email: tu.user.email });
  const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (otpErr) throw new Error(`verifyOtp: ${otpErr.message}`);
  const ref = new URL(url).hostname.split(".")[0];
  const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
    .map((c) => `${c.name}=${c.value}`).join("; ");

  // (1)
  for (const [name, id, code] of [["초안", draft, "DRAFT_NOT_PUBLISHED"], ["안 찍힘", unfilmed, "NOT_FILMED"], ["보류(held)", held, "NOT_FILMED"]]) {
    const r = await fetch(`${ORIGIN}/api/projects/${id}/apply-rerecord`, { method: "POST", headers: { Cookie: cookie } });
    const b = await r.json().catch(() => ({}));
    ok(`(1) ${name} → 409 ${code}`, r.status === 409 && b.code === code, `${r.status} ${b.code ?? ""}`);
  }
  const { data: rows } = await svc.from("projects").select("demo_build_status").in("id", [draft, unfilmed, held]);
  ok("(1') 어느 행도 pending이 안 됨", (rows ?? []).every((r) => r.demo_build_status !== "pending"), (rows ?? []).map((r) => r.demo_build_status).join(","));
  const { count: ev } = await svc.from("demo_events").select("id", { count: "exact", head: true }).eq("user_id", uid);
  ok("(1') 촬영 기록 0", !ev, String(ev));

  // (2)
  const sign = (path) => fetch(`${ORIGIN}/api/storage/sign`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "app", folder: unfilmed, files: [{ path, size: 10 }] }),
  }).then(async (r) => ({ status: r.status, code: (await r.json().catch(() => ({}))).code ?? "" }));
  for (const p of ["config/master.key", ".dev.vars", "infra/terraform.tfvars", "wp-config.php"]) {
    const r = await sign(p);
    ok(`(2) ${p} → 400 SECRET_FILE`, r.status === 400 && r.code === "SECRET_FILE", `${r.status} ${r.code}`);
  }
  const fine = await sign("index.html");
  ok("(2) index.html → 200", fine.status === 200, `${fine.status} ${fine.code}`);
} catch (err) {
  ok("예외", false, err instanceof Error ? err.message : String(err));
} finally {
  if (uid) {
    const { error } = await svc.auth.admin.deleteUser(uid);
    ok("끝 — 일회용 계정 지움", !error, error?.message ?? "");
  }
}

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
