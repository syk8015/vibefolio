// 초안 파일 비공개(2026-11-02, lib/previewToken.ts·previewAccess.ts) prod E2E. 조건: 배포 뒤.
//   관리자 계정에 시험용 초안 하나 + 파일 2개(index.html·app.js)를 진짜 길(/api/storage/sign)로 올리고:
//   (1) 초안 폴더: 익명 → 404 (HTML·JS 둘 다) · nookframe.com 주소는 미리보기 도메인으로 보냄
//   (2) 주인 열쇠: preview-link 로그인 없이 401 · 남의/없는 작품 404 · 주인 → 열쇠 주소 →
//       200 + private,no-store · 상대 주소(app.js)도 열쇠를 물려받아 200 · 다른 폴더·고친 열쇠 → 404
//   (3) 공개하면 바로 열림(닫힘은 기억하지 않음) · 다시 초안으로 → 95초 안에 닫힘(열림 기억 30초 + CDN 60초)
//   (4) media.nookframe.com/files/…/index.html → 403 (Cloudflare 방화벽 규칙 — 사용자가 걸어야 함)
//   (5) 이미 공개된 업로드 작품은 그대로 200
//   끝: 시험용 초안·파일 지움(/api/projects/[id]/demo-assets DELETE — 대시보드 삭제와 같은 길)
// ⚠️ 2분쯤 걸린다. 대시보드에 시험용 초안이 잠깐 보일 수 있다.
// 사용: node scripts/probe-preview-privacy.mjs
import "./_secrets.mjs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = "https://nookframe.com";
const PREVIEW = "https://vibefolio-beta.vercel.app";
const MEDIA = "https://media.nookframe.com";
const ADMIN_EMAIL = "vivestarter@gmail.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const pending = [];
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (u, headers = {}) => fetch(u, { redirect: "manual", headers, cache: "no-store" });

const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email: ADMIN_EMAIL });
const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (otpErr) { console.error("verifyOtp:", otpErr.message); process.exit(1); }
const ref = new URL(url).hostname.split(".")[0];
const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
  .map((c) => `${c.name}=${c.value}`).join("; ");
const uid = sess.user.id;
const id = randomUUID();
const MARK = `probe-${id.slice(0, 8)}`;
const files = {
  "index.html": `<!doctype html><title>${MARK}</title><script src="./app.js"></script><p>${MARK}</p>`,
  "app.js": `console.log(${JSON.stringify(MARK)});`,
};
const pub = (f) => `${PREVIEW}/api/preview/${uid}/${id}/${f}`;
let created = false;

try {
  // 준비: 초안 행 + 파일
  const { error: insErr } = await svc.from("projects").insert({
    id, user_id: uid, title: "__probe_preview_DONOTKEEP__", is_draft: true, demo_url: `/api/preview/${uid}/${id}/index.html`,
  });
  if (insErr) throw new Error(`insert: ${insErr.message}`);
  created = true;
  const signRes = await fetch(`${ORIGIN}/api/storage/sign`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "app", folder: id, files: Object.entries(files).map(([path, body]) => ({ path, size: Buffer.byteLength(body) })) }),
  });
  const sign = await signRes.json();
  if (!signRes.ok) throw new Error(`sign: ${signRes.status} ${JSON.stringify(sign)}`);
  for (const t of sign.targets) {
    const put = await fetch(t.url, { method: "PUT", headers: t.headers, body: files[t.path] });
    if (!put.ok) throw new Error(`put ${t.path}: ${put.status}`);
  }

  // (1)
  const a1 = await get(pub("index.html"));
  ok("(1a) 초안 HTML 익명 → 404", a1.status === 404, String(a1.status));
  const a2 = await get(pub("app.js"));
  ok("(1b) 초안 JS 익명 → 404", a2.status === 404, String(a2.status));
  const a3 = await get(`${ORIGIN}/api/preview/${uid}/${id}/index.html`);
  ok("(1c) nookframe.com 주소 → 미리보기 도메인으로", a3.status === 307 && (a3.headers.get("location") ?? "").startsWith(PREVIEW), `${a3.status}`);

  // (2)
  const noLogin = await get(`${ORIGIN}/api/projects/${id}/preview-link`);
  ok("(2a) 열쇠 받기 — 로그인 없이 401", noLogin.status === 401, String(noLogin.status));
  const nobody = await get(`${ORIGIN}/api/projects/${randomUUID()}/preview-link`, { Cookie: cookie });
  ok("(2b) 없는 작품 → 404", nobody.status === 404, String(nobody.status));
  const { data: other } = await svc.from("profiles").select("id").eq("username", "sample-studio").maybeSingle();
  if (other) {
    const { data: theirs } = await svc.from("projects").select("id").eq("user_id", other.id).limit(1).maybeSingle();
    if (theirs) {
      const r = await get(`${ORIGIN}/api/projects/${theirs.id}/preview-link`, { Cookie: cookie });
      ok("(2c) 남의 작품 → 404(관리자라도)", r.status === 404, String(r.status));
    }
  }
  const lr = await get(`${ORIGIN}/api/projects/${id}/preview-link`, { Cookie: cookie });
  const lb = await lr.json().catch(() => ({}));
  ok("(2d) 주인 → 열쇠 주소", lr.status === 200 && /\/~v1\.\d+\.[\w-]{43}\/index\.html$/.test(lb.url ?? ""), `${lr.status}`);
  const t1 = await get(lb.url);
  const t1body = await t1.text();
  ok("(2e) 열쇠 주소 → 200 + 내용", t1.status === 200 && t1body.includes(MARK), String(t1.status));
  ok("(2f) 열쇠 주소는 어디에도 안 남김(private, no-store)", (t1.headers.get("cache-control") ?? "").includes("no-store"), t1.headers.get("cache-control") ?? "");
  const t2 = await get(lb.url.replace(/index\.html$/, "app.js"));
  ok("(2g) 상대 주소(app.js)도 열쇠를 물려받아 200", t2.status === 200, String(t2.status));
  const otherFolder = lb.url.replace(`/${id}/`, `/${randomUUID()}/`);
  const t3 = await get(otherFolder);
  ok("(2h) 이 열쇠로 다른 폴더 → 404", t3.status === 404, String(t3.status));
  const forged = lb.url.replace(/\.([\w-])([\w-]{42})\/index\.html$/, (_, c, r) => `.${c === "A" ? "B" : "A"}${r}/index.html`);
  const t4 = await get(forged);
  ok("(2i) 고친 열쇠 → 404", t4.status === 404, String(t4.status));

  // (3)
  await svc.from("projects").update({ is_draft: false }).eq("id", id);
  const p1 = await get(pub("index.html"));
  ok("(3a) 공개하자마자 익명 200", p1.status === 200 && (await p1.text()).includes(MARK), String(p1.status));
  ok("(3b) 공개 작품은 짧게 공개 캐시", (p1.headers.get("cache-control") ?? "").startsWith("public"), p1.headers.get("cache-control") ?? "");
  await svc.from("projects").update({ is_draft: true }).eq("id", id);
  await sleep(95_000);
  const p2 = await get(pub("index.html"));
  ok("(3c) 다시 초안 → 95초 안에 닫힘", p2.status === 404, String(p2.status));

  // (4)
  const m = await fetch(`${MEDIA}/files/${uid}/${id}/index.html`, { method: "HEAD", cache: "no-store" });
  if (m.status === 403) ok("(4) media 도메인 /files/의 HTML → 403(방화벽)", true);
  else pending.push(`(4) media 도메인 /files/의 HTML이 아직 ${m.status} — Cloudflare 방화벽 규칙을 걸어야 한다`);

  // (5)
  const { data: live } = await svc.from("projects").select("demo_url").eq("is_draft", false).is("taken_down_at", null)
    .like("demo_url", "/api/preview/%.html").limit(1).maybeSingle();
  if (live) {
    const l = await get(`${PREVIEW}${live.demo_url}`);
    ok("(5) 이미 공개된 업로드 작품은 그대로 200", l.status === 200, String(l.status));
  }
} catch (err) {
  ok("예외", false, err instanceof Error ? err.message : String(err));
} finally {
  if (created) {
    const del = await fetch(`${ORIGIN}/api/projects/${id}/demo-assets`, { method: "DELETE", headers: { Cookie: cookie } });
    const { data: left } = await svc.from("projects").select("id").eq("id", id).maybeSingle();
    if (left) await svc.from("projects").delete().eq("id", id);
    ok("끝 — 시험용 초안·파일 지움", del.ok || !left, String(del.status));
  }
}

for (const p of pending) console.log(`… ${p}`);
console.log(failed ? `\n${failed}건 실패` : pending.length ? "\n코드 쪽은 모두 통과 (확인 대기 위 참고)" : "\n모두 통과");
process.exit(failed ? 1 : 0);
