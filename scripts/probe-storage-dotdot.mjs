// 저장소 쓰기 경로에 ".."를 섞어 남의 폴더에 쓸 수 있는지 prod E2E(2026-09-23, 실DB 대조).
//
// 배경: 실DB의 storage.objects엔 같은 일을 하는 쓰기 규칙이 세 벌 겹쳐 있고(대시보드 손 규칙·
// migration_security_hardening·migration_prelaunch_hardening), permissive 규칙은 OR라서
// security_hardening의 ".." 금지 WITH CHECK는 사실상 무력하다. 그래도 안전한 이유를 여기서 지킨다:
//   (1) 로그인 키로 자기 폴더 업로드·같은 이름 교체·아바타 업로드·자기 파일 삭제 → 성공
//       (supabase/migration_storage_write_policies.sql로 규칙을 한 벌로 합친 뒤에도 앱이 도는지)
//   (2) 주소를 정리하지 않은 날것 "{uid}/../{가짜uid}/…" 업로드 → 403(서버 앞단이 ".."를 풀고,
//       RLS는 풀린 최종 이름의 첫 폴더를 본다 → 남의 폴더면 거부)
//   (3) "%2e%2e"로 감춘 모양 → 거부
// 가짜 uid는 존재하지 않는 사용자라 실사용자 폴더는 건드리지 않는다. 시험 파일은 끝에서 지운다.
// 사용: node scripts/probe-storage-dotdot.mjs
import "./_secrets.mjs";
import https from "node:https";
import { createClient } from "@supabase/supabase-js";

const EMAIL = "vivestarter@gmail.com";
const BUCKET = "project-files";
const FAKE = "00000000-0000-4000-8000-000000000000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const user = createClient(url, anonKey, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const { data: link, error: linkErr } = await svc.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (linkErr) { console.error("generateLink:", linkErr.message); process.exit(1); }
const { data: sess, error: otpErr } = await user.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (otpErr) { console.error("verifyOtp:", otpErr.message); process.exit(1); }
const uid = sess.user.id;
const host = new URL(url).host;

// supabase-js·fetch는 URL의 ".."를 보내기 전에 풀어 버린다 — 날것 그대로 보내려면 https.request.
function rawUpload(path) {
  return new Promise((resolve) => {
    const body = "probe";
    const req = https.request({ host, method: "POST", path: `/storage/v1/object/${BUCKET}/${path}`, headers: {
      apikey: anonKey, Authorization: `Bearer ${sess.session.access_token}`,
      "content-type": "text/plain", "content-length": Buffer.byteLength(body), "x-upsert": "true",
    } }, (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve({ status: res.statusCode, body: d })); });
    req.on("error", (e) => resolve({ status: 0, body: e.message }));
    req.end(body);
  });
}

const t = Date.now();
const blob = () => new Blob(["probe"], { type: "text/plain" });
const good = `${uid}/_probe/ok-${t}.txt`;
const r1 = await user.storage.from(BUCKET).upload(good, blob(), { upsert: true });
ok("자기 폴더 정상 업로드", !r1.error, r1.error?.message ?? "");
// 같은 이름으로 다시(upsert = 교체) — 대시보드의 썸네일·파일 교체가 쓰는 길(UPDATE 규칙).
const r1b = await user.storage.from(BUCKET).upload(good, blob(), { upsert: true });
ok("같은 이름 교체(upsert)", !r1b.error, r1b.error?.message ?? "");
// 아바타 버킷도 같은 규칙 — 프로필 사진 업로드가 쓰는 길. 기존 아바타를 건드리지 않게 _probe 아래.
const avatarKey = `${uid}/_probe/avatar-${t}.txt`;
const r1c = await user.storage.from("avatars").upload(avatarKey, blob(), { upsert: true });
ok("아바타 버킷 업로드", !r1c.error, r1c.error?.message ?? "");
// 자기 파일 삭제를 사용자 키로(DELETE 규칙) — 업로드 실패 뒤 정리가 쓰는 길.
const del = await user.storage.from(BUCKET).remove([good]);
ok("자기 파일 삭제(사용자 키)", !del.error && (del.data ?? []).length === 1, del.error?.message ?? `${(del.data ?? []).length}개 지움`);
await svc.storage.from("avatars").remove([avatarKey]).catch(() => {});

const r2 = await rawUpload(`${uid}/../${FAKE}/_probe/x-${t}.txt`);
ok('날것 ".."로 남의 폴더 쓰기 → 거부', r2.status >= 400 && /row-level security|AccessDenied/i.test(r2.body), `HTTP ${r2.status}`);

const r3 = await rawUpload(`${uid}/%2e%2e/${FAKE}/_probe/y-${t}.txt`);
ok('"%2e%2e"로 감춘 모양 → 거부', r3.status >= 400, `HTTP ${r3.status}`);

// 정리 — 내 시험 폴더 + 가짜 uid 아래에 혹시 생긴 것.
const mine = await svc.storage.from(BUCKET).list(`${uid}/_probe`);
if (mine.data?.length) await svc.storage.from(BUCKET).remove(mine.data.map((f) => `${uid}/_probe/${f.name}`));
const { data: stray } = await svc.schema("storage").from("objects").select("name").eq("bucket_id", BUCKET).like("name", `%${FAKE}%`);
if (stray?.length) await svc.storage.from(BUCKET).remove(stray.map((o) => o.name));
ok("가짜 사용자 폴더에 아무것도 안 생김", !(stray ?? []).length, `${(stray ?? []).length}개`);

await user.auth.signOut({ scope: "local" }).catch(() => {});
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
