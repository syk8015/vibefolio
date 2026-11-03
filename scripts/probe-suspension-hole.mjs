// 정지·내리기를 지웠다 다시 만들어 푸는 구멍(2026-11-02, supabase/migration_suspension_hole.sql — audit-6 F1·F2) prod E2E.
// 조건: SQL 적용 + 배포 뒤. 일회용 계정 하나로(진짜 계정은 안 건드림):
//   (1) 정지된 사람이 사용자 키로 자기 명함 행을 지우지 못한다 → 정지가 그대로 남는다 · 익명 키도 못 지운다
//   (2) 사용자 키로 projects에 새 행을 못 넣는다 · 기본값은 초안
//   (3) 내린 작품은 못 지운다 — 사용자 키 직접 · 대시보드 삭제 길(409 TAKEN_DOWN, 파일도 안 지움) ·
//       인제스트 초안 삭제 길(PAT, 409) · 고치기(PATCH)·finalize도 409 · 예약 폴더 서명 거절 ·
//       내린 폴더를 다른 공개 작품이 가리켜도 미리보기 닫힘(2026-11-03, 보안 5단계)
//   (4) 평소 일은 그대로 — 내리지 않은 작품 삭제 200 · 명함 고치기
//   끝: 일회용 계정 지움(행·토큰은 함께 지워진다)
// 사용: node scripts/probe-suspension-hole.mjs
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const PREVIEW = "https://vibefolio-beta.vercel.app";
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
    // (3d~3f) 2026-11-03 보안 5단계 S2-F1·S3-F1·S3-F6 — 내린 작품을 고치기·실패 분기로 지우기
    const pat = { Authorization: `Bearer ${tb.token}`, "Content-Type": "application/json" };
    const r6 = await fetch(`${ORIGIN}/api/ingest/drafts/${downDraft}`, { method: "PATCH", headers: pat, body: JSON.stringify({ title: `${MARK} 고침` }) });
    const b6 = await r6.json().catch(() => ({}));
    ok("(3d) 내린 초안 — 인제스트 고치기(PATCH) → 409 TAKEN_DOWN", r6.status === 409 && b6.code === "TAKEN_DOWN", `${r6.status} ${b6.code ?? ""}`);
    const r7 = await fetch(`${ORIGIN}/api/ingest/finalize`, { method: "POST", headers: pat, body: JSON.stringify({ projectId: downDraft }) });
    const b7 = await r7.json().catch(() => ({}));
    ok("(3e) 내린 초안 — finalize → 409 TAKEN_DOWN", r7.status === 409 && b7.code === "TAKEN_DOWN", `${r7.status} ${b7.code ?? ""}`);
    ok("(3e') 행이 남음", await rowExists("projects", downDraft));
  } else {
    ok("(3c) PAT 발급", false, `${tr.status} ${tb.code ?? ""}`);
  }

  // (3f) 예약 폴더(_upload·_media)엔 사용자 파일을 서명해 주지 않는다
  const sign = (files, folder = downPub) => fetch(`${ORIGIN}/api/storage/sign`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "app", folder, files }),
  });
  const r8 = await sign([{ path: "_upload/zzzzzzzz-ffffffffffff/screenshot.bin", size: 16 }]);
  const b8 = await r8.json().catch(() => ({}));
  ok("(3f) 예약 폴더 _upload/ 서명 → 400 BAD_FILE_PATH", r8.status === 400 && b8.code === "BAD_FILE_PATH", `${r8.status} ${b8.code ?? ""}`);

  // (3g) 내린 작품의 미리보기 폴더를 같은 주인의 다른 공개 작품이 가리켜도 닫혀 있다(S8-F1)
  const html = "<!doctype html><title>probe</title>";
  const r9 = await sign([{ path: "index.html", size: html.length }]);
  const b9 = await r9.json().catch(() => ({}));
  if (r9.ok && b9.targets?.[0]) {
    const tgt = b9.targets[0];
    await fetch(tgt.url, { method: "PUT", headers: tgt.headers ?? { "Content-Type": "application/octet-stream" }, body: html });
    await svc.from("projects").update({ demo_url: `/api/preview/${uid}/${downPub}/index.html` }).eq("id", normal);
    const r10 = await fetch(`${PREVIEW}/api/preview/${uid}/${downPub}/index.html?nfp=${tag}`);
    ok("(3g) 내린 폴더를 다른 공개 작품이 가리켜도 → 닫힘(404)", r10.status === 404, String(r10.status));
    await svc.from("projects").update({ demo_url: "https://example.com/" }).eq("id", normal);
    // 대조: 같은 파일을 공개 작품 자기 폴더에 두면 열린다(파일·서빙 길이 살아 있어 위 404가 진짜 닫힘이다)
    const r11 = await sign([{ path: "index.html", size: html.length }], normal);
    const b11 = await r11.json().catch(() => ({}));
    if (r11.ok && b11.targets?.[0]) {
      await fetch(b11.targets[0].url, { method: "PUT", headers: b11.targets[0].headers, body: html });
      const r12 = await fetch(`${PREVIEW}/api/preview/${uid}/${normal}/index.html?nfp=${tag}`);
      ok("(3g') 대조 — 공개 작품 자기 폴더는 열림(200)", r12.status === 200, String(r12.status));
    } else {
      ok("(3g') 대조 파일 서명", false, `${r11.status} ${b11.code ?? ""}`);
    }
  } else {
    ok("(3g) 시험 파일 서명", false, `${r9.status} ${b9.code ?? ""}`);
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
