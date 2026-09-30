// 수정 창에서 파일을 다시 올린 뒤 옛 작품 폴더 청소 실서버 E2E
// (app/api/projects/[id]/demo-assets POST의 prevDemoUrl).
//
// 검증: (1) 옛 무작위 폴더는 통째로 지워지고 새 폴더는 남음 (2) 주인의 다른 작품이 쓰는 폴더는
// 안 지움 (3) thumbnails/처럼 UUID가 아닌 폴더는 못 고름 (4) 남의 폴더는 못 고름
// (5) 지금 쓰는 폴더는 안 지움 (6) 행 폴더(Connect 업로드)는 _media와 쓰는 썸네일을 남기고 비움.
// 사용: `node scripts/probe-folder-swap.mjs` (배포 뒤)
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const BUCKET = "project-files";

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};
const put = async (key) => {
  const { error } = await svc.storage.from(BUCKET).upload(key, new Blob(["<p>nf probe</p>"]), { upsert: true, contentType: "text/html" });
  if (error) throw new Error(`upload ${key}: ${error.message}`);
};
const exists = async (key) => {
  const dir = key.slice(0, key.lastIndexOf("/"));
  const { data } = await svc.storage.from(BUCKET).list(dir, { limit: 1000 });
  return !!data?.some((e) => `${dir}/${e.name}` === key);
};
const preview = (key) => `/api/preview/${key}`;

let userId = null;
const strangerDir = `${crypto.randomUUID()}/${crypto.randomUUID()}`;
try {
  const stamp = Date.now();
  const username = `nfprobefold${stamp}`.slice(0, 30);
  const email = `delivered+nfprobe-fold-${stamp}@resend.dev`;
  const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { username } });
  if (cErr) throw cErr;
  userId = created.user.id;
  const { data: link, error: lErr } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (lErr) throw lErr;
  const user = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sess, error: vErr } = await user.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  const ref = new URL(URL_).hostname.split(".")[0];
  const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
    .map((c) => `${c.name}=${c.value}`).join("; ");
  await svc.from("profiles").upsert({ id: userId, username, name: "NF probe" });

  const A = `${userId}/${crypto.randomUUID()}`;
  const B = `${userId}/${crypto.randomUUID()}`;
  const SHARED = `${userId}/${crypto.randomUUID()}`;
  const THUMB = `${userId}/thumbnails/${crypto.randomUUID()}.png`;
  await Promise.all([
    put(`${A}/index.html`), put(`${A}/js/app.js`), put(`${B}/index.html`),
    put(`${SHARED}/index.html`), put(THUMB), put(`${strangerDir}/index.html`),
  ]);

  const insert = async (demo_url) => {
    const { data, error } = await svc.from("projects").insert({
      user_id: userId, title: "NF probe folder", demo_url, is_draft: true, primary_locale: "ko",
    }).select("id").single();
    if (error) throw error;
    return data.id;
  };
  const id = await insert(preview(`${A}/index.html`));
  await insert(preview(`${SHARED}/index.html`)); // 다른 작품이 쓰는 폴더

  const clean = async (projectId, prevDemoUrl) => {
    const r = await fetch(`${ORIGIN}/api/projects/${projectId}/demo-assets`, {
      method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ prevDemoUrl }),
    });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, removed: j.removed };
  };

  // 수정 창과 같은 길: 사용자 키로 demo_url을 새 폴더로 바꾼 뒤 청소를 부른다.
  {
    const { error } = await user.from("projects").update({ demo_url: preview(`${B}/index.html`) }).eq("id", id);
    if (error) throw error;
    const r = await clean(id, preview(`${A}/index.html`));
    ok("(1) 옛 폴더 청소 200·2개", r.status === 200 && r.removed === 2, JSON.stringify(r));
    ok("(1) 옛 폴더 파일 없음", !(await exists(`${A}/index.html`)) && !(await exists(`${A}/js/app.js`)));
    ok("(1) 새 폴더 파일 남음", await exists(`${B}/index.html`));
  }
  {
    const r = await clean(id, preview(`${SHARED}/index.html`));
    ok("(2) 다른 작품이 쓰는 폴더는 안 지움", r.removed === 0 && (await exists(`${SHARED}/index.html`)), JSON.stringify(r));
  }
  {
    const r = await clean(id, preview(THUMB));
    ok("(3) thumbnails/ 폴더는 못 고름", r.removed === 0 && (await exists(THUMB)), JSON.stringify(r));
  }
  {
    const r = await clean(id, preview(`${strangerDir}/index.html`));
    ok("(4) 남의 폴더는 못 고름", r.removed === 0 && (await exists(`${strangerDir}/index.html`)), JSON.stringify(r));
  }
  {
    const r = await clean(id, preview(`${B}/index.html`));
    ok("(5) 지금 쓰는 폴더는 안 지움", r.removed === 0 && (await exists(`${B}/index.html`)), JSON.stringify(r));
  }
  // (6) Connect 업로드처럼 행 폴더를 쓰던 작품
  {
    const rowId = await insert("https://example.com/nfprobe-placeholder");
    const R = `${userId}/${rowId}`;
    await Promise.all([put(`${R}/index.html`), put(`${R}/_media/screenshot.png`), put(`${R}/_media/extra.png`)]);
    const shot = svc.storage.from(BUCKET).getPublicUrl(`${R}/_media/screenshot.png`).data.publicUrl;
    await svc.from("projects").update({ demo_url: preview(`${R}/index.html`), thumbnail: shot }).eq("id", rowId);
    const C = `${userId}/${crypto.randomUUID()}`;
    await put(`${C}/index.html`);
    await user.from("projects").update({ demo_url: preview(`${C}/index.html`) }).eq("id", rowId);
    const r = await clean(rowId, preview(`${R}/index.html`));
    ok("(6) 행 폴더의 옛 파일 지움", r.status === 200 && !(await exists(`${R}/index.html`)), JSON.stringify(r));
    ok("(6) _media는 남김", (await exists(`${R}/_media/screenshot.png`)) && (await exists(`${R}/_media/extra.png`)));
  }
} finally {
  if (userId) {
    const { data: files } = await svc.storage.from(BUCKET).list(userId, { limit: 1000 });
    const all = [];
    const queue = (files ?? []).map((f) => ({ path: `${userId}/${f.name}`, dir: f.id === null }));
    while (queue.length) {
      const e = queue.shift();
      if (!e.dir) { all.push(e.path); continue; }
      const { data } = await svc.storage.from(BUCKET).list(e.path, { limit: 1000 });
      for (const f of data ?? []) queue.push({ path: `${e.path}/${f.name}`, dir: f.id === null });
    }
    if (all.length) await svc.storage.from(BUCKET).remove(all);
    await svc.from("projects").delete().eq("user_id", userId);
    await svc.from("profiles").delete().eq("id", userId);
    await svc.auth.admin.deleteUser(userId);
  }
  await svc.storage.from(BUCKET).remove([`${strangerDir}/index.html`]);
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall folder-swap probes passed");
process.exit(failed ? 1 : 0);
