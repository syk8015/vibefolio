// 신고 인박스 "비공개로 내리기"(2026-09-01) prod E2E.
//   (1) 배포 대기 — 구코드는 action을 무시하고 resolve만 한다
//   (2) 작품 신고 + takedown → 200·is_draft=true·신고 resolved
//   (3) 프로필 신고 + takedown → 400 TARGET_NOT_SUPPORTED (못 하는 일은 거절)
//   (4) 본문 없는 POST(구 버튼) → 여전히 resolve로 동작·작품은 공개 유지
//   (5) 쿠키 없이 호출 → 404 (관리자 전용, 존재도 안 알림)
//   (6) 이미 처리된 신고 재호출 → 409
// 관리자 세션은 비침습 magiclink(generateLink→verifyOtp)로 만든다 — 비번 안 건드림.
// ⚠️ (2)는 소유자에게 실제 메일을 보낸다(관리자 본인 주소). 제목에 DONOTKEEP 표식.
// 사용: node scripts/probe-report-takedown.mjs
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const ADMIN_EMAIL = "vivestarter@gmail.com";
const MARK = "__probe_takedown_DONOTKEEP__";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// ── 관리자 세션 → ssr 쿠키 헤더
const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
if (linkErr) { console.error("generateLink:", linkErr.message); process.exit(1); }
const { data: sess, error: otpErr } = await anon.auth.verifyOtp({
  type: "magiclink", token_hash: link.properties.hashed_token,
});
if (otpErr) { console.error("verifyOtp:", otpErr.message); process.exit(1); }
const ref = new URL(url).hostname.split(".")[0];
const cookieHeader = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
  .map((c) => `${c.name}=${c.value}`).join("; ");
const adminId = sess.user.id;

const post = async (reportId, body, withCookie = true) => {
  const res = await fetch(`${ORIGIN}/api/admin/reports/${reportId}`, {
    method: "POST",
    headers: {
      ...(withCookie ? { Cookie: cookieHeader } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const newProject = async (title) => {
  const { data, error } = await svc.from("projects").insert({
    user_id: adminId, title, description: "", demo_url: "https://example.com/",
    is_draft: false,
  }).select("id").single();
  if (error) throw new Error(`project insert: ${error.message}`);
  return data.id;
};
const newReport = async (targetType, targetId, key) => {
  const { data, error } = await svc.from("content_reports").insert({
    target_type: targetType, target_id: targetId, reason: "adult",
    detail: MARK, reporter_key: key, status: "open",
  }).select("id").single();
  if (error) throw new Error(`report insert: ${error.message}`);
  return data.id;
};

const made = { projects: [], reports: [] };
try {
  // (1) 배포 대기 — 구코드는 프로필 신고에도 200(그냥 resolve)을 준다.
  const warmProj = await newProject(`${MARK} warm`);
  made.projects.push(warmProj);
  let ready = false;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const rid = await newReport("profile", adminId, `probe-warm-${made.reports.length}`);
    made.reports.push(rid);
    const r = await post(rid, { action: "takedown" });
    if (r.status === 400 && r.body?.code === "TARGET_NOT_SUPPORTED") { ready = true; break; }
    console.log(`  … 배포 대기 (status ${r.status} ${JSON.stringify(r.body).slice(0, 90)})`);
    await new Promise((s) => setTimeout(s, 30_000));
  }
  ok("(3) 프로필 신고 takedown은 400으로 거절", ready);

  // (2) 작품 내리기
  const projId = await newProject(`${MARK} 내려질 작품`);
  made.projects.push(projId);
  const repId = await newReport("project", projId, "probe-takedown");
  made.reports.push(repId);
  const td = await post(repId, { action: "takedown" });
  ok("(2) takedown 200", td.status === 200, JSON.stringify(td.body).slice(0, 120));
  ok("(2) takenDown=true 에코", td.body?.takenDown === true, JSON.stringify(td.body));
  const { data: after } = await svc.from("projects").select("is_draft").eq("id", projId).single();
  ok("(2) 작품이 실제로 비공개(초안)로 내려감", after?.is_draft === true, `is_draft=${after?.is_draft}`);
  const { data: repAfter } = await svc.from("content_reports").select("status").eq("id", repId).single();
  ok("(2) 신고가 resolved로 종결", repAfter?.status === "resolved", repAfter?.status);

  // (6) 재호출 → 409
  const again = await post(repId, { action: "takedown" });
  ok("(6) 이미 처리된 신고 재호출은 409", again.status === 409, `status ${again.status}`);

  // (4) 본문 없는 POST(구 버튼) → resolve만, 작품은 공개 유지
  const keepId = await newProject(`${MARK} 유지될 작품`);
  made.projects.push(keepId);
  const repKeep = await newReport("project", keepId, "probe-resolve");
  made.reports.push(repKeep);
  const plain = await post(repKeep, null);
  ok("(4) 본문 없는 POST는 여전히 200", plain.status === 200, JSON.stringify(plain.body).slice(0, 90));
  const { data: keepAfter } = await svc.from("projects").select("is_draft").eq("id", keepId).single();
  ok("(4) '문제 없음'은 작품을 내리지 않는다", keepAfter?.is_draft === false, `is_draft=${keepAfter?.is_draft}`);

  // (5) 쿠키 없이 → 404
  const repAnon = await newReport("project", keepId, "probe-noauth");
  made.reports.push(repAnon);
  const noauth = await post(repAnon, { action: "takedown" }, false);
  ok("(5) 비관리자에겐 404(엔드포인트 존재도 안 알림)", noauth.status === 404, `status ${noauth.status}`);
} finally {
  if (made.reports.length) await svc.from("content_reports").delete().in("id", made.reports);
  await svc.from("content_reports").delete().eq("detail", MARK);
  if (made.projects.length) await svc.from("projects").delete().in("id", made.projects);
  const { data: left } = await svc.from("projects").select("id").ilike("title", `%DONOTKEEP%`);
  if (left?.length) await svc.from("projects").delete().in("id", left.map((r) => r.id));
  const { data: check } = await svc.from("projects").select("id").ilike("title", `%DONOTKEEP%`);
  console.log(`[cleanup] 잔여 throwaway ${check?.length ?? 0}건`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
