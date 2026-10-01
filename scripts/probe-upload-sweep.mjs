// 끝맺음(finalize)이 안 온 업로드 청소 실서버 E2E (lib/uploadSweep.ts, 점검 크론 4e).
//
// probe 계정에 행 4개를 심고 점검 크론을 한 번 부른다:
//   E — 파일 없는 초안, 이틀 전 → 행도 폴더(`_upload/<옛 세션>/bundle.zip`)도 사라진다
//   F — 파일 없는 초안, 1시간 전 → 남는다(아직 올리는 중일 수 있다)
//   G — URL이 붙은 초안, 이틀 전 → 남는다(버려진 초안 자동 삭제는 안 한다)
//   H — 공개 작품. `_upload/`에 이틀 전 세션 + 1시간 전 세션 + 방금 교체 표식 → 옛 세션만 사라진다
// 세션 나이는 이름 앞 8자(시각)로 흉내 낸다. 표식의 날짜는 스토리지가 찍어서 되돌릴 수 없다 —
// "하루 지난 표식은 지운다"는 단위 프로브(probe-upload-sweep-unit)가 본다.
//
// ⚠️ 크론을 직접 부르니 그 틱의 다른 점검(경보 메일 포함, 창마다 한 번)도 같이 돈다. H가 잠깐
//    공개 상태라 첫 화면에 probe 계정이 뜰 수 있다. 끝나면 계정째 지운다.
// 행이 20개를 넘으면 임시 파일은 5분마다 구간을 돌며 본다 — 그때 H 검사는 틀릴 수 있다(로그로 알린다).
// 파일은 R2(2026-10-01~) — 대시보드와 같은 서명 API로 심고, 있는지는 media.nookframe.com을 키마다 한 번만
// 두드려 본다(처음 부르는 주소라 CDN 캐시가 없다). 이 컴퓨터엔 R2 열쇠가 없다.
// 사용: `node scripts/probe-upload-sweep.mjs` (CRON_SECRET 필요)
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 220)}` : ""}`);
  if (!pass) failed++;
};
if (!process.env.CRON_SECRET) {
  console.error("CRON_SECRET이 없어 크론을 부를 수 없어요.");
  process.exit(1);
}
const H = 3_600_000;
const session = (t) => `${Math.floor(t).toString(36).padStart(8, "0")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
let cookie = null;
const BYTES = new Uint8Array([80, 75, 3, 4]);
// key = {uid}/{행 id}/{상대경로} — 서명 API로 그 행 폴더에 올린다.
const put = async (key) => {
  const [, folder, ...rest] = key.split("/");
  const r = await fetch(`${ORIGIN}/api/storage/sign`, {
    method: "POST", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "app", folder, files: [{ path: rest.join("/"), size: BYTES.byteLength }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`sign ${key}: ${r.status} ${JSON.stringify(j)}`);
  const t = j.targets[0];
  const p = await fetch(t.url, { method: "PUT", headers: t.headers, body: BYTES });
  if (!p.ok) throw new Error(`put ${key}: ${p.status}`);
};
const exists = async (key) => (await fetch(`https://media.nookframe.com/files/${key}`, { method: "HEAD" })).status === 200;
const rowExists = async (id) => !!(await svc.from("projects").select("id").eq("id", id).maybeSingle()).data;

let userId = null;
try {
  const { count } = await svc.from("projects").select("id", { count: "exact", head: true });
  if ((count ?? 0) + 4 > 20) console.log(`- 행이 ${count}개 — 임시 파일 구간 돌기가 켜져 H 검사가 이번 틱에 안 걸릴 수 있음`);

  const stamp = Date.now();
  const username = `nfprobeus${stamp}`.slice(0, 30);
  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email: `delivered+nfprobe-us-${stamp}@resend.dev`, email_confirm: true, user_metadata: { username },
  });
  if (cErr) throw cErr;
  userId = created.user.id;
  await svc.from("profiles").upsert({ id: userId, username, name: "NF probe" });
  const email = created.user.email;
  const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  const userClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sess, error: vErr } = await userClient.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
    .map((c) => `${c.name}=${c.value}`).join("; ");

  const mk = async (title, fields) => {
    const { data, error } = await svc.from("projects")
      .insert({ user_id: userId, title, primary_locale: "ko", demo_url: "", ...fields }).select("id").single();
    if (error) throw error;
    return data.id;
  };
  const twoDays = new Date(Date.now() - 48 * H).toISOString();
  const E = await mk("NF probe empty old", { is_draft: true, created_at: twoDays });
  const F = await mk("NF probe empty new", { is_draft: true, created_at: new Date(Date.now() - H).toISOString() });
  const G = await mk("NF probe url draft", { is_draft: true, demo_url: "https://example.com/", created_at: twoDays });
  const Hrow = await mk("NF probe public", { is_draft: false, demo_url: "https://example.com/" });

  const eSess = session(Date.now() - 48 * H);
  await put(`${userId}/${E}/_upload/${eSess}/bundle.zip`);
  const oldS = session(Date.now() - 30 * H);
  const newS = session(Date.now() - H);
  await put(`${userId}/${Hrow}/_upload/${oldS}/bundle.zip`);
  await put(`${userId}/${Hrow}/_upload/${newS}/bundle.zip`);
  await put(`${userId}/${Hrow}/_upload/replace.marker`);

  const r = await fetch(`${ORIGIN}/api/cron/health`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const body = await r.json().catch(() => ({}));
  ok("크론이 청소를 돌림", r.ok && body.uploadSweep && typeof body.uploadSweep.emptyDrafts === "number", JSON.stringify(body.uploadSweep));

  ok("E 이틀 된 빈 초안 → 행 삭제", !(await rowExists(E)));
  ok("E 폴더도 비움", !(await exists(`${userId}/${E}/_upload/${eSess}/bundle.zip`)));
  ok("F 1시간 된 빈 초안 → 남음", await rowExists(F));
  ok("G URL 붙은 초안 → 남음", await rowExists(G));
  ok("H 공개 작품 → 남음", await rowExists(Hrow));
  const [oldLeft, newLeft, markLeft] = await Promise.all([
    `${userId}/${Hrow}/_upload/${oldS}/bundle.zip`, `${userId}/${Hrow}/_upload/${newS}/bundle.zip`, `${userId}/${Hrow}/_upload/replace.marker`,
  ].map(exists));
  ok("H 옛 세션만 사라짐", !oldLeft && newLeft && markLeft, JSON.stringify({ oldLeft, newLeft, markLeft }));
} catch (e) {
  ok("예외 없이 끝남", false, e?.message ?? e);
} finally {
  if (userId) {
    // 계정 삭제 API가 R2의 사용자 파일까지 지운다.
    const del = cookie ? await fetch(`${ORIGIN}/api/account`, { method: "DELETE", headers: { cookie } }).catch(() => null) : null;
    if (!del?.ok) {
      await svc.from("projects").delete().eq("user_id", userId);
      await svc.from("profiles").delete().eq("id", userId);
      await svc.auth.admin.deleteUser(userId);
    }
  }
}
console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
