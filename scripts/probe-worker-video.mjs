// 주인이 올린 영상 줄이기 서버 짝 실서버 E2E(2026-10-02, app/api/worker/video).
//   (1) 워커 열쇠 없음 → 401
//   (2) claim: 공개 작품의 안 줄인 우리 저장소 영상을 집는다(진짜 작품은 skip으로 비켜 간다 — 손대지 않는다)
//   (3) sign: 크기 0 → 400 · 정상 → {uid}/videos/…-nf.mp4
//   (4) done: 남의 폴더 주소 → 400 · 그사이 주인이 바꾼 영상(from 불일치) → stale + 새 파일 지움
//   (5) done: 정상 → video_url이 새 주소, 원본 파일 지움, 다시 claim해도 안 집힘
// 임시 계정 하나를 만들고 끝나면 계정 삭제 API로 계정·파일을 같이 지운다. 영상은 ffmpeg로 4초짜리를 만든다.
// 사용: `node scripts/probe-worker-video.mjs` (배포 뒤, .env.local의 WORKER_SECRET 필요)
import "./_secrets.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
if (!process.env.WORKER_SECRET) { console.error("WORKER_SECRET 없음(.env.local)"); process.exit(1); }

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};
const worker = (body, auth = true) => fetch(`${ORIGIN}/api/worker/video`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(auth ? { authorization: `Bearer ${process.env.WORKER_SECRET}` } : {}) },
  body: JSON.stringify(body),
});
const json = async (r) => r.json().catch(() => ({}));
// media.nookframe.com은 5분 캐시 — 쿼리를 붙여 저장소에 바로 묻는다.
const exists = async (url) => (await fetch(`${url}?nfp=${crypto.randomUUID()}`, { method: "HEAD" })).status === 200;
const put = (t, body) => fetch(t.url, { method: "PUT", headers: t.headers, body });

const tmp = mkdtempSync(join(tmpdir(), "nfprobe-video-"));
let userId = null, cookie = null;
try {
  const src = join(tmp, "src.mp4"), small = join(tmp, "small.mp4");
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30", "-t", "4", "-c:v", "libx264", "-crf", "10", src]);
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-c:v", "libx264", "-crf", "30", "-movflags", "+faststart", small]);
  const srcBytes = readFileSync(src), smallBytes = readFileSync(small);

  const stamp = Date.now();
  const username = `nfprobevid${stamp}`.slice(0, 30);
  const email = `delivered+nfprobe-vid-${stamp}@resend.dev`;
  const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { username } });
  if (cErr) throw cErr;
  userId = created.user.id;
  const { data: link, error: lErr } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (lErr) throw lErr;
  const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sess, error: vErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  const ref = new URL(URL_).hostname.split(".")[0];
  cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
    .map((c) => `${c.name}=${c.value}`).join("; ");
  await svc.from("profiles").upsert({ id: userId, username, name: "NF probe" });

  // 주인이 대시보드에서 올리듯 원본을 올린다.
  const signRes = await fetch(`${ORIGIN}/api/storage/sign`, {
    method: "POST", headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "video", ext: "mp4", size: srcBytes.length, contentType: "video/mp4" }),
  });
  const { target: up } = await json(signRes);
  if (!up) throw new Error(`storage sign ${signRes.status}`);
  if (!(await put(up, srcBytes)).ok) throw new Error("original upload failed");
  const original = up.publicUrl;
  const { data: row, error: iErr } = await svc.from("projects").insert({
    user_id: userId, title: "NF probe video", demo_url: "https://example.com", is_draft: false, video_url: original,
  }).select("id").single();
  if (iErr) throw iErr;
  const id = row.id;

  const r1 = await worker({ op: "claim" }, false);
  ok("(1) 워커 열쇠 없음 → 401", r1.status === 401, `got ${r1.status}`);

  // 진짜 작품은 건드리지 않게 — 우리 행 말고 집힐 수 있는 공개 작품은 전부 skip.
  const { data: others } = await svc.from("projects").select("id").eq("is_draft", false).neq("id", id);
  const skip = (others ?? []).map((p) => p.id);
  const r2 = await json(await worker({ op: "claim", skip }));
  ok("(2) claim: 우리 행을 집는다", r2.job?.id === id && r2.job?.src === original, JSON.stringify(r2));

  const r3a = await worker({ op: "sign", projectId: id, size: 0 });
  ok("(3) sign: 크기 0 → 400", r3a.status === 400, `got ${r3a.status}`);
  const s1 = await json(await worker({ op: "sign", projectId: id, size: smallBytes.length }));
  ok("(3) sign: {uid}/videos/…-nf.mp4", typeof s1.target?.key === "string" && s1.target.key.startsWith(`${userId}/videos/`) && s1.target.key.endsWith("-nf.mp4"), s1.target?.key);
  ok("(3) 서명 주소로 올라감", (await put(s1.target, smallBytes)).ok);

  const stranger = s1.target.publicUrl.replace(userId, crypto.randomUUID());
  const r4a = await worker({ op: "done", projectId: id, from: original, to: stranger });
  ok("(4) done: 남의 폴더 주소 → 400", r4a.status === 400, `got ${r4a.status}`);
  const r4b = await json(await worker({ op: "done", projectId: id, from: `${original}x`, to: s1.target.publicUrl }));
  const afterStale = (await svc.from("projects").select("video_url").eq("id", id).single()).data;
  ok("(4) 원본이 바뀐 뒤면 stale, 영상 그대로", r4b.stale === true && afterStale.video_url === original, JSON.stringify(r4b));
  ok("(4) stale이면 새 파일은 지움", !(await exists(s1.target.publicUrl)));

  const s2 = await json(await worker({ op: "sign", projectId: id, size: smallBytes.length }));
  await put(s2.target, smallBytes);
  const r5 = await json(await worker({ op: "done", projectId: id, from: original, to: s2.target.publicUrl }));
  const after = (await svc.from("projects").select("video_url").eq("id", id).single()).data;
  ok("(5) done: video_url이 새 주소", r5.ok === true && !r5.stale && after.video_url === s2.target.publicUrl, JSON.stringify(r5));
  ok("(5) 새 파일은 있고 원본은 지움", (await exists(s2.target.publicUrl)) && !(await exists(original)));
  const r5c = await json(await worker({ op: "claim", skip }));
  ok("(5) 줄인 영상은 다시 안 집힘", r5c.job === null, JSON.stringify(r5c));
} finally {
  rmSync(tmp, { recursive: true, force: true });
  if (userId) {
    const del = cookie ? await fetch(`${ORIGIN}/api/account`, { method: "DELETE", headers: { cookie } }).catch(() => null) : null;
    if (!del?.ok) {
      await svc.from("projects").delete().eq("user_id", userId);
      await svc.from("profiles").delete().eq("id", userId);
      await svc.auth.admin.deleteUser(userId);
    }
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall worker-video probes passed");
process.exit(failed ? 1 : 0);
