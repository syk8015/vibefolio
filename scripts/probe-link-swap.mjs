// 심사 뒤 주소 바꿔치기 차단 실서버 E2E (위협 목록 D3, supabase/migration_link_verified.sql).
//
// 검증: (1) 찍힌 작품(관리자 권한으로 촬영 완료를 흉내)은 link_unverified=false, 명함·작품 화면에
// 체험 주소가 보임 (2) 익명 키로 link_unverified는 읽히고 demo_filmed_source는 안 읽힘
// (3) 주인이 사용자 키로 demo_url을 바꾸면 true + 명함·작품 화면 원문에 새 주소가 없음
// (4) 사용자 키로 demo_filmed_source·link_unverified를 직접 못 씀 (5) 새 주소로 다시 찍힌 것처럼
// 관리자 권한으로 완료를 쓰면 false로 돌아옴 (6) trigger-demo가 다른 사이트의 demoAccess.url을
// 400 DEMO_ACCESS_OFFSITE로 거절(촬영 대기열·한도에 닿기 전에 끝난다).
//
// ⚠️ 검사 동안(약 30초) probe 작품이 공개 상태라 첫 화면 목록에 probe 계정이 잠깐 뜬다. 끝나면 계정째 지운다.
// 사용: `node scripts/probe-link-swap.mjs` (SQL 적용 뒤)
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createChunks, stringToBase64URL } from "@supabase/ssr";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};
const flag = async (id) => (await svc.from("projects").select("link_unverified").eq("id", id).single()).data?.link_unverified;
const html = async (path) => (await fetch(`${ORIGIN}${path}${path.includes("?") ? "&" : "?"}nfp=${Date.now()}`)).text();

const GOOD = "https://example.com/nfprobe-good";
const EVIL = "https://example.org/nfprobe-swapped";
let userId = null;
try {
  const stamp = Date.now();
  const username = `nfprobelink${stamp}`.slice(0, 30);
  const email = `delivered+nfprobe-link-${stamp}@resend.dev`;
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

  // 촬영 완료를 흉내: 관리자 권한으로 소스·영상·완료를 쓴다(워커 markDone과 같은 칸).
  const { data: row, error: iErr } = await svc.from("projects").insert({
    user_id: userId, title: "NF probe link", demo_url: GOOD, is_draft: false, primary_locale: "ko",
  }).select("id").single();
  if (iErr) throw iErr;
  const id = row.id;
  await svc.from("projects").update({ demo_source_type: "live_url", demo_source_value: GOOD, demo_build_status: "pending" }).eq("id", id);
  await svc.from("projects").update({
    demo_video_url: "https://example.com/nfprobe.mp4", demo_build_status: "done", demo_generated_at: new Date().toISOString(),
  }).eq("id", id);

  // 공개 화면은 60초 캐시 — 대시보드처럼 /api/revalidate로 비우고 본다.
  const refresh = () => fetch(`${ORIGIN}/api/revalidate`, { method: "POST", headers: { cookie } });
  ok("(1) 찍힌 작품 → link_unverified=false", (await flag(id)) === false);
  {
    await refresh();
    const card = await html(`/${username}`);
    const work = await html(`/${username}/${id}`);
    ok("(1) 명함·작품 화면에 체험 주소가 보임", card.includes(GOOD) && work.includes(GOOD), `명함=${card.includes(GOOD)} 작품=${work.includes(GOOD)}`);
  }
  {
    const a = await anon.from("projects").select("link_unverified").eq("id", id).single();
    ok("(2) 익명 키로 link_unverified 읽힘", !a.error && a.data?.link_unverified === false, a.error?.message);
    const b = await anon.from("projects").select("demo_filmed_source").eq("id", id).single();
    ok("(2) 익명 키로 demo_filmed_source 안 읽힘", !!b.error, b.error?.code ?? "읽힘");
  }

  // (3) 주인이 주소를 바꾼다 — 대시보드 수정과 같은 길(사용자 키 직접 UPDATE)
  {
    const { error } = await user.from("projects").update({ demo_url: EVIL }).eq("id", id);
    ok("(3) 사용자 키로 주소 바꾸기는 됨(막는 게 아니라 숨긴다)", !error, error?.message);
    ok("(3) 바꾼 뒤 link_unverified=true", (await flag(id)) === true);
    await refresh();
    const card = await html(`/${username}`);
    const work = await html(`/${username}/${id}`);
    ok("(3) 명함·작품 화면 원문에 새 주소 없음(작품은 그대로 보임)",
      !card.includes(EVIL) && !work.includes(EVIL) && card.includes("NF probe link") && work.includes("NF probe link"),
      `명함=${card.includes(EVIL)} 작품=${work.includes(EVIL)}`);
  }
  // (4) 판정 칸을 직접 못 고침
  {
    const a = await user.from("projects").update({ demo_filmed_source: EVIL }).eq("id", id);
    ok("(4) 사용자 키로 demo_filmed_source 못 씀", !!a.error, a.error?.code ?? "써짐");
    const b = await user.from("projects").update({ link_unverified: false }).eq("id", id);
    ok("(4) 사용자 키로 link_unverified 못 씀", !!b.error, b.error?.code ?? "써짐");
    ok("(4) 여전히 true", (await flag(id)) === true);
  }
  // (6) 다른 사이트 demoAccess — 초안이 아니라도 trigger-demo 게이트는 같은 순서로 먼저 본다.
  {
    await svc.from("projects").update({ demo_access: { url: "https://example.net/demo" } }).eq("id", id);
    const r = await fetch(`${ORIGIN}/api/projects/${id}/trigger-demo`, { method: "POST", headers: { cookie } });
    const j = await r.json().catch(() => ({}));
    ok("(6) 다른 사이트 demoAccess.url → 400 DEMO_ACCESS_OFFSITE", r.status === 400 && j.code === "DEMO_ACCESS_OFFSITE", `${r.status} ${j.code}`);
    await svc.from("projects").update({ demo_access: { url: "https://sub.example.org/demo" } }).eq("id", id);
    const s = await fetch(`${ORIGIN}/api/projects/${id}/trigger-demo`, { method: "POST", headers: { cookie } });
    const k = await s.json().catch(() => ({}));
    ok("(6) 링크한 사이트의 하위 도메인은 통과(다음 단계 409 이미 영상 있음)", k.code !== "DEMO_ACCESS_OFFSITE", `${s.status} ${k.code}`);
  }
  // (5) 새 주소로 다시 찍혀 완료
  {
    await svc.from("projects").update({ demo_source_value: EVIL, demo_build_status: "pending" }).eq("id", id);
    ok("(5) 다시 찍는 중(대기)엔 여전히 true", (await flag(id)) === true);
    await svc.from("projects").update({
      demo_video_url: "https://example.com/nfprobe2.mp4", demo_build_status: "done", demo_generated_at: new Date().toISOString(),
    }).eq("id", id);
    ok("(5) 새 주소 촬영 완료 → false", (await flag(id)) === false);
  }
} finally {
  if (userId) {
    await svc.from("projects").delete().eq("user_id", userId);
    await svc.from("profiles").delete().eq("id", userId);
    await svc.auth.admin.deleteUser(userId);
  }
}

console.log(failed ? `\n✗ ${failed} failed` : "\nall link-swap probes passed");
process.exit(failed ? 1 : 0);
