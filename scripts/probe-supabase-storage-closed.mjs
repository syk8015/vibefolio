// 옛 Supabase 파일 버킷이 닫혀 있는지 실서버 검사(2026-10-01, supabase/migration_close_supabase_storage.sql).
//
// 사용자 파일은 R2로 옮겼다(lib/userStorage.ts). 그런데 Supabase 버킷에 "자기 폴더엔 써도 된다" 규칙이나
// 공개 설정이 다시 살아나면, 누구든 자기 로그인 키로 큰 파일을 올려 공개 주소를 퍼뜨리고 Supabase 무료
// 전송량(월 5GB)을 바닥낼 수 있다 — 옮긴 이유가 그대로 돌아온다. 옛 SQL(rls_v2·security_hardening·
// prelaunch·storage_write_policies)을 다시 돌리면 규칙이 되살아나니 그때 이걸로 알아챈다.
//   (1) 로그인 키로 자기 폴더에 올리기 → 두 버킷 모두 거절
//   (2) 두 버킷 다 비공개(public=false)
//   (3) 공개 주소 형식으로 읽기 → 200이 아님
// (옛 probe-storage-dotdot의 ".." 검사는 이제 서명 API가 맡는다 — scripts/probe-user-storage.mjs (1).)
// 사용: `node scripts/probe-supabase-storage-closed.mjs`
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

let userId = null;
try {
  const stamp = Date.now();
  const email = `delivered+nfprobe-sbc-${stamp}@resend.dev`;
  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { username: `nfprobesbc${stamp}`.slice(0, 30) },
  });
  if (cErr) throw cErr;
  userId = created.user.id;
  const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  const user = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: vErr } = await user.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;

  for (const [bucket, path] of [["project-files", `${userId}/${crypto.randomUUID()}/index.html`], ["avatars", `${userId}/avatar.png`]]) {
    const { error } = await user.storage.from(bucket).upload(path, new Blob(["nf probe"]), { upsert: true });
    ok(`(1) 로그인 키로 ${bucket}에 올리기 → 거절`, !!error, error?.message ?? "올라감");
    if (!error) await svc.storage.from(bucket).remove([path]);
  }

  const { data: buckets, error: bErr } = await svc.storage.listBuckets();
  if (bErr) throw bErr;
  for (const id of ["project-files", "avatars"]) {
    const b = buckets.find((x) => x.id === id);
    ok(`(2) ${id} 비공개`, !!b && b.public === false, JSON.stringify(b ? { public: b.public } : null));
  }

  const r = await fetch(`${URL_}/storage/v1/object/public/project-files/${userId}/x.html`);
  ok("(3) 공개 주소로 읽기 → 200 아님", r.status !== 200, `${r.status}`);
} finally {
  if (userId) await svc.auth.admin.deleteUser(userId);
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall supabase-storage-closed probes passed");
process.exit(failed ? 1 : 0);
