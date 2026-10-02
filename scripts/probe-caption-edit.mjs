// 공개된 영상의 자막 고치기 실서버 E2E(2026-10-02, app/api/projects/[id]/captions PATCH).
//   (1) 쿠키 없음 → 401  (2) 남의 작품 → 403  (3) 빈 글·너무 긴 글·없는 줄 → 400
//   (4) 주인 → 200: 그 줄 글만 바뀌고 시각은 그대로, 같은 글을 단 대본 장면도 같이 바뀜
//   (5) 촬영 중 → 409 (워커가 곧 시간표를 통째로 덮는다)
// 임시 계정 둘(주인·남)을 만들고, 끝나면 계정 삭제 API(실패하면 관리자 권한)로 같이 지운다.
// 작품 행은 초안이라 공개 화면엔 안 뜬다. 사용: `node scripts/probe-caption-edit.mjs` (배포 뒤)
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

async function makeUser(tag) {
  const stamp = Date.now();
  const username = `nfprobecap${tag}${stamp}`.slice(0, 30);
  const email = `delivered+nfprobe-cap-${tag}-${stamp}@resend.dev`;
  const { data: created, error: cErr } = await svc.auth.admin.createUser({ email, email_confirm: true, user_metadata: { username } });
  if (cErr) throw cErr;
  const id = created.user.id;
  const { data: link, error: lErr } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  if (lErr) throw lErr;
  const client = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: sess, error: vErr } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (vErr) throw vErr;
  const ref = new URL(URL_).hostname.split(".")[0];
  const cookie = createChunks(`sb-${ref}-auth-token`, "base64-" + stringToBase64URL(JSON.stringify(sess.session)))
    .map((c) => `${c.name}=${c.value}`).join("; ");
  await svc.from("profiles").upsert({ id, username, name: "NF probe" });
  return { id, cookie };
}

const users = [];
try {
  const owner = await makeUser("o"); users.push(owner);
  const stranger = await makeUser("s"); users.push(stranger);

  const CAPTIONS = { en: [{ start: 0, end: 3.2, text: "Every room, live." }, { start: 3.2, end: 7, text: "Tap a room" }] };
  const SCRIPT = { steps: [
    { goal: "open", action: "click", selector: "#a", caption: { en: "Every room, live." } },
    { goal: "tap", action: "click", selector: "#b", caption: { en: "Tap a room" } },
    { goal: "more", action: "click", selector: "#c", caption: { en: "Other" } },
    { goal: "end", action: "click", selector: "#d", caption: { en: "Tap a room" } },
  ] };
  const { data: row, error: iErr } = await svc.from("projects").insert({
    user_id: owner.id, title: "NF probe captions", demo_url: "https://example.com", is_draft: true, primary_locale: "ko",
    demo_script: SCRIPT,
  }).select("id").single();
  if (iErr) throw iErr;
  const id = row.id;
  // 촬영 완료를 흉내 — 워커만 쓰는 칸이라 관리자 권한으로.
  await svc.from("projects").update({ demo_build_status: "done", demo_captions: CAPTIONS }).eq("id", id);

  const patch = (cookie, body) => fetch(`${ORIGIN}/api/projects/${id}/captions`, {
    method: "PATCH", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
  });
  const read = async () => (await svc.from("projects").select("demo_captions, demo_script").eq("id", id).single()).data;

  const r1 = await patch(null, { locale: "en", index: 1, text: "x" });
  ok("(1) 쿠키 없음 → 401", r1.status === 401, `got ${r1.status}`);

  const r2 = await patch(stranger.cookie, { locale: "en", index: 1, text: "hacked" });
  ok("(2) 남의 작품 → 403/404", r2.status === 403 || r2.status === 404, `got ${r2.status}`);

  const r3a = await patch(owner.cookie, { locale: "en", index: 1, text: "   " });
  ok("(3) 빈 글 → 400 CAPTION_EMPTY", r3a.status === 400 && (await r3a.json()).code === "CAPTION_EMPTY", `got ${r3a.status}`);
  const r3b = await patch(owner.cookie, { locale: "en", index: 1, text: "a".repeat(91) });
  ok("(3) 91자 → 400 CAPTION_TOO_LONG", r3b.status === 400 && (await r3b.json()).code === "CAPTION_TOO_LONG", `got ${r3b.status}`);
  const r3c = await patch(owner.cookie, { locale: "en", index: 5, text: "x" });
  ok("(3) 없는 줄 → 400 CAPTION_NO_CUE", r3c.status === 400 && (await r3c.json()).code === "CAPTION_NO_CUE", `got ${r3c.status}`);
  const r3d = await patch(owner.cookie, { locale: "ko", index: 0, text: "x" });
  ok("(3) 없는 언어 → 400", r3d.status === 400, `got ${r3d.status}`);
  const untouched = await read();
  ok("(2)(3) 거절된 요청은 아무것도 안 바꿈", JSON.stringify(untouched.demo_captions) === JSON.stringify(CAPTIONS));

  const r4 = await patch(owner.cookie, { locale: "en", index: 1, text: "Tap a room to open it" });
  const j4 = await r4.json().catch(() => ({}));
  const after = await read();
  ok("(4) 주인 → 200", r4.status === 200 && j4.ok === true, `got ${r4.status} ${JSON.stringify(j4).slice(0, 120)}`);
  ok("(4) 그 줄 글만 바뀌고 시각은 그대로",
    after.demo_captions.en[1].text === "Tap a room to open it" && after.demo_captions.en[1].start === 3.2
    && after.demo_captions.en[1].end === 7 && after.demo_captions.en[0].text === "Every room, live.");
  const caps = after.demo_script.steps.map((s) => s.caption?.en);
  ok("(4) 같은 글을 단 대본 장면도 같이 바뀜", caps[1] === "Tap a room to open it" && caps[3] === "Tap a room to open it" && caps[2] === "Other" && caps[0] === "Every room, live.", JSON.stringify(caps));

  // 촬영 중 — 'recording'(워커가 집어 가는 'pending'은 피한다). 바로 되돌린다.
  await svc.from("projects").update({ demo_build_status: "recording" }).eq("id", id);
  const r5 = await patch(owner.cookie, { locale: "en", index: 0, text: "Changed" });
  await svc.from("projects").update({ demo_build_status: "done" }).eq("id", id);
  ok("(5) 촬영 중 → 409", r5.status === 409, `got ${r5.status}`);
} finally {
  for (const u of users) {
    const del = await fetch(`${ORIGIN}/api/account`, { method: "DELETE", headers: { cookie: u.cookie } }).catch(() => null);
    if (!del?.ok) {
      await svc.from("projects").delete().eq("user_id", u.id);
      await svc.from("profiles").delete().eq("id", u.id);
      await svc.auth.admin.deleteUser(u.id);
    }
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall caption-edit probes passed");
process.exit(failed ? 1 : 0);
