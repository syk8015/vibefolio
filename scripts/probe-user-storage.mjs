// 사용자 파일 R2 저장 실서버 E2E (2026-10-01, lib/userStorage.ts · app/api/storage/sign).
//
// 검증: (1) 서명 게이트 — 로그인 없으면 401, 폴더가 UUID가 아니거나 `..`·비밀 파일·너무 큰 파일은 400
// (2) 브라우저처럼 R2에 바로 PUT — 사전 확인(CORS)이 nookframe.com을 허락하는지, 서명된 크기·형식과
// 다르면 403 (3) 같은 사이트 문제 — media.nookframe.com에서 HTML은 내려받기 전용, 그림은 진짜 형식
// (4) 미리보기 프록시가 R2에서 읽어 HTML로 띄우고, 쿼리 붙은 JS는 308로 쿼리를 뗀다
// (5) 작품 삭제·계정 삭제가 R2 파일을 지운다(미리보기가 404).
//
// 계정은 Resend 테스트 주소로 만들고 마지막에 계정 삭제 API로 지운다(그게 (5)의 검사이기도 하다).
// 사용: `node scripts/probe-user-storage.mjs`
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 220)}` : ""}`);
  if (!pass) failed++;
};

const HTML = "<!doctype html><title>nf probe</title><script src=\"app.js\"></script><p>nf-probe-r2</p>";
const JS = "console.log('nf probe')";
// 1x1 png
const PNG = Uint8Array.from(Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
  "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex"));

let userId = null;
let cookie = null;
let accountDeleted = false;
try {
  const stamp = Date.now();
  const username = `nfprobest${stamp}`.slice(0, 30);
  const email = `delivered+nfprobe-st-${stamp}@resend.dev`;
  const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { username } });
  if (cErr) throw cErr;
  userId = created.user.id;
  await svc.from("profiles").upsert({ id: userId, username, name: "NF probe" });
  const { data: link } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  const user = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sess, error: vErr } = await user.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  const ref = new URL(URL_).hostname.split(".")[0];
  cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
    .map((c) => `${c.name}=${c.value}`).join("; ");

  const sign = (body, withCookie = true) => fetch(`${ORIGIN}/api/storage/sign`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(withCookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

  // (1) 게이트
  const folder = crypto.randomUUID();
  {
    const r = await sign({ kind: "app", folder, files: [{ path: "index.html", size: 10 }] }, false);
    ok("(1) 로그인 없으면 401", r.status === 401, `${r.status}`);
    const cases = [
      [{ kind: "app", folder: "not-a-uuid", files: [{ path: "index.html", size: 10 }] }, "폴더가 UUID 아님"],
      [{ kind: "app", folder, files: [{ path: "../x/index.html", size: 10 }] }, "`..` 경로"],
      [{ kind: "app", folder, files: [{ path: ".env", size: 10 }] }, "비밀 파일(.env)"],
      [{ kind: "app", folder, files: [{ path: "big.bin", size: 26 * 1024 * 1024 }] }, "25MB 넘는 파일"],
      [{ kind: "video", ext: "exe", size: 10 }, "영상 확장자 아님"],
      [{ kind: "thumbnail", ext: "svg", size: 10 }, "SVG 썸네일"],
    ];
    for (const [body, label] of cases) {
      const x = await sign(body);
      ok(`(1) ${label} → 400`, x.status === 400, `${x.status} ${x.json.code ?? ""}`);
    }
  }

  // (2) 서명 + 브라우저처럼 PUT
  const s = await sign({ kind: "app", folder, files: [
    { path: "index.html", size: Buffer.byteLength(HTML) },
    { path: "app.js", size: Buffer.byteLength(JS) },
  ] });
  ok("(2) 앱 파일 서명", s.status === 200 && s.json.targets?.length === 2, `${s.status} ${JSON.stringify(s.json).slice(0, 120)}`);
  const t = Object.fromEntries((s.json.targets ?? []).map((x) => [x.path, x]));
  if (t["index.html"]) {
    const pre = await fetch(t["index.html"].url, {
      method: "OPTIONS",
      headers: {
        Origin: "https://nookframe.com",
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": Object.keys(t["index.html"].headers).join(","),
      },
    });
    const acao = pre.headers.get("access-control-allow-origin");
    ok("(2) R2 사전 확인이 nookframe.com의 PUT을 허락(CORS)", pre.ok && (acao === "https://nookframe.com" || acao === "*"), `${pre.status} acao=${acao}`);
    const wrongSize = await fetch(t["index.html"].url, { method: "PUT", headers: t["index.html"].headers, body: HTML + "extra" });
    ok("(2) 서명과 다른 크기 → 거절", wrongSize.status === 403 || wrongSize.status === 400, `${wrongSize.status}`);
    const wrongType = await fetch(t["index.html"].url, { method: "PUT", headers: { ...t["index.html"].headers, "content-type": "text/html" }, body: HTML });
    ok("(2) 서명과 다른 형식(text/html) → 거절", wrongType.status === 403 || wrongType.status === 400, `${wrongType.status}`);
    const put1 = await fetch(t["index.html"].url, { method: "PUT", headers: t["index.html"].headers, body: HTML });
    const put2 = await fetch(t["app.js"].url, { method: "PUT", headers: t["app.js"].headers, body: JS });
    ok("(2) 서명대로 PUT → 200", put1.ok && put2.ok, `${put1.status} ${put2.status}`);

    // (3) 같은 사이트 문제
    const pub = await fetch(t["index.html"].publicUrl);
    ok("(3) media.nookframe.com의 HTML = 내려받기 전용", pub.ok
      && pub.headers.get("content-type") === "application/octet-stream"
      && /attachment/.test(pub.headers.get("content-disposition") ?? ""),
      `${pub.status} ${pub.headers.get("content-type")} ${pub.headers.get("content-disposition")}`);

    // (4) 미리보기 프록시
    const prev = await fetch(`${ORIGIN}/api/preview/${userId}/${folder}/index.html`);
    const prevText = await prev.text();
    ok("(4) 미리보기가 R2에서 읽어 HTML로 띄움", prev.ok && (prev.headers.get("content-type") ?? "").startsWith("text/html") && prevText.includes("nf-probe-r2"),
      `${prev.status} ${prev.headers.get("content-type")} ${prev.url}`);
    const previewOrigin = new URL(prev.url).origin;
    const q = await fetch(`${previewOrigin}/api/preview/${userId}/${folder}/app.js?bust=${stamp}`, { redirect: "manual" });
    ok("(4) 쿼리 붙은 JS → 308 쿼리 없는 주소", q.status === 308 && !(q.headers.get("location") ?? "").includes("?"), `${q.status} ${q.headers.get("location")}`);
  }

  // 썸네일·프로필 사진
  {
    const th = await sign({ kind: "thumbnail", ext: "png", size: PNG.byteLength, contentType: "image/png" });
    const put = th.json.target ? await fetch(th.json.target.url, { method: "PUT", headers: th.json.target.headers, body: PNG }) : null;
    const got = th.json.target ? await fetch(th.json.target.publicUrl) : null;
    ok("(3) 썸네일 = image/png로 보임", put?.ok && got?.ok && got.headers.get("content-type") === "image/png", `${put?.status} ${got?.headers.get("content-type")}`);
    const av = await sign({ kind: "avatar", ext: "png", size: PNG.byteLength, contentType: "image/png" });
    ok("프로필 사진 키 = avatars/{uid}/avatar.png", (av.json.target?.publicUrl ?? "").endsWith(`/avatars/${userId}/avatar.png`), av.json.target?.publicUrl);
    if (av.json.target) await fetch(av.json.target.url, { method: "PUT", headers: av.json.target.headers, body: PNG });
  }

  // (5) 작품 삭제 → R2 폴더 삭제
  {
    const { data: row } = await svc.from("projects").insert({
      user_id: userId, title: "NF probe storage", demo_url: `/api/preview/${userId}/${folder}/index.html`, is_draft: true,
    }).select("id").single();
    const del = await fetch(`${ORIGIN}/api/projects/${row.id}/demo-assets`, { method: "DELETE", headers: { cookie } });
    // 미리보기 응답은 엣지에 60초 캐시된다 — 위 (4)에서 본 주소라 쿼리를 붙여 캐시를 피한다(HTML은 쿼리 허용).
    const after = await fetch(`${ORIGIN}/api/preview/${userId}/${folder}/index.html?after=${Date.now()}`);
    ok("(5) 작품 삭제 → 업로드 폴더가 R2에서 지워짐(미리보기 404)", del.ok && after.status === 404, `${del.status} → ${after.status}`);
  }
  // (5) 계정 삭제 → 남은 R2 파일(프로필 사진 등)도 지움
  {
    const del = await fetch(`${ORIGIN}/api/account`, { method: "DELETE", headers: { cookie } });
    const j = await del.json().catch(() => ({}));
    accountDeleted = del.ok;
    ok("(5) 계정 삭제가 R2 사용자 파일도 지움", del.ok && (j.r2Removed ?? 0) >= 1, `${del.status} ${JSON.stringify(j)}`);
  }
} finally {
  if (userId && !accountDeleted) {
    await svc.from("projects").delete().eq("user_id", userId);
    await svc.from("profiles").delete().eq("id", userId);
    await svc.auth.admin.deleteUser(userId);
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall user-storage probes passed");
process.exit(failed ? 1 : 0);
