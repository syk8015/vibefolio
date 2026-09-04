// 대본 점검표(accepted.scriptReview, 2026-09-04) prod E2E — 실제 nookframe.com API를
// PAT로 때린다. 순수 함수는 probe-script-review-unit.mts가 보고, 여기선 "응답에 실려
// 오나 · 서버가 진입 URL의 HTML을 정말 받아 셀렉터를 세나 · 영상 동봉이면 없나 ·
// 초안 PATCH에도 붙나"를 본다.
//
// 픽스처 = 소넷5가 09-03 밤에 실제로 보낸 모양(6스텝·조작 1) — 게이트는 통과하지만
// 점검표가 "조작 적음"을 짚어야 한다. 진입 URL은 example.com(정적 HTML: h1·p·a[href]
// 있음, id 없음). 같은 URL 재푸시=upsert라 판마다 쿼리로 URL을 갈라 새 행을 만든다.
//
// 사용: 레포 루트에서 `node scripts/probe-script-review.mjs`
// 주의: ingest 발행 버킷(20/h) 3회 + 관리 버킷 1회 소비. 서비스롤 키는 키체인(_secrets.mjs).
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const { data: prof } = await svc.from("profiles").select("id, username").eq("username", "vivestarter").maybeSingle();
if (!prof) {
  console.error("프로브 소유자(vivestarter) 프로필을 못 찾았어요.");
  process.exit(1);
}
const rawToken = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc
  .from("api_tokens")
  .insert({
    user_id: prof.id,
    token_hash: createHash("sha256").update(rawToken).digest("hex"),
    token_prefix: `${rawToken.slice(0, 14)}…`,
    name: "__probe_review_delete_me__",
  })
  .select("id")
  .single();

const run = randomBytes(3).toString("hex");
const made = [];
const headers = { Authorization: `Bearer ${rawToken}`, "Content-Type": "application/json" };
const post = async (body) => {
  const res = await fetch(`${ORIGIN}/api/ingest`, { method: "POST", headers, body: JSON.stringify(body) });
  const out = { status: res.status, body: await res.json().catch(() => ({})) };
  if (out.body?.projectId) made.push(out.body.projectId);
  return out;
};
const patch = async (id, body) => {
  const res = await fetch(`${ORIGIN}/api/ingest/drafts/${id}`, { method: "PATCH", headers, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// 소넷5 모양: 6스텝, focus 5 + click 1, 셀렉터 전부, expect 전부. example.com에
// 있는 것(h1·p·a[href]) 3개 + 없는 것(#nope-xyz·.no-such-class) 2개 + where만 1개.
const SONNET_LIKE = {
  steps: [
    { goal: "제목", selector: "h1", where: "맨 위 제목", action: "focus", expect: "Example Domain", hold: 2 },
    { goal: "본문", selector: "p", where: "설명 문단", action: "focus", expect: "설명이 보인다", hold: 2 },
    { goal: "링크", selector: "a[href]", where: "More information 링크", action: "click", expect: "IANA 페이지", hold: 2 },
    { goal: "없는 id", selector: "#nope-xyz", where: "카드", action: "focus", expect: "카드가 보인다" },
    { goal: "없는 class", selector: ".no-such-class", where: "목록", action: "focus", expect: "목록이 보인다" },
    { goal: "셀렉터 없음", where: "하단 배지", action: "focus", expect: "배지" },
  ],
  prep: "정적 페이지",
};
const BASE = {
  description: "프로브가 만든 임시 행\n곧 지워집니다",
  demoAccess: { noLogin: true, note: "프로브 픽스처 — 정적 페이지, 인증 가드 없음" },
};

try {
  // ───────── ① 발행 응답에 점검표 ─────────
  const a = await post({ ...BASE, title: `__probe_review_a_${run}__`, deployUrl: `https://example.com/?probe=${run}-a`, demoScript: SONNET_LIKE });
  ok("소넷 모양 대본 → 200(게이트 통과)", a.status === 200, `status ${a.status} ${JSON.stringify(a.body).slice(0, 160)}`);
  const rv = a.body?.accepted?.scriptReview;
  ok("accepted.scriptReview 있음", !!rv, JSON.stringify(rv ?? a.body).slice(0, 300));
  ok("steps 6 · wired 5 · interactive 1 · withExpect 6 · skip 없음",
    rv?.steps === 6 && rv?.wired === 5 && rv?.interactive === 1 && rv?.withExpect === 6 && rv?.hasSkip === false,
    JSON.stringify({ steps: rv?.steps, wired: rv?.wired, interactive: rv?.interactive, withExpect: rv?.withExpect, hasSkip: rv?.hasSkip }));
  const sel = rv?.selectors;
  ok("서버가 진입 URL HTML을 받아 셀렉터를 셈(status=checked)", sel?.status === "checked", JSON.stringify(sel));
  ok("있는 셀렉터 3개 찾음(h1·p·a[href])", sel?.checked === 5 && sel?.found === 3, `checked ${sel?.checked} found ${sel?.found}`);
  ok("없는 셀렉터 2개를 정확히 짚음", Array.isArray(sel?.missing) && sel.missing.join("|") === "#nope-xyz|.no-such-class", JSON.stringify(sel?.missing));
  ok("probe url = 진입 URL(demoAccess 합성)", typeof sel?.url === "string" && sel.url.startsWith("https://example.com/?probe="), sel?.url);
  const hints = rv?.hints ?? [];
  ok("hints: 조작 적음", hints.some((h) => h.includes("actually interact")), hints.join(" | ").slice(0, 200));
  ok("hints: 셀렉터 못 찾음", hints.some((h) => h.includes("NOT found") && h.includes("#nope-xyz")));
  ok("hints: 셀렉터 없는 스텝", hints.some((h) => h.includes("have no selector")));
  ok("hints: skip 없음", hints.some((h) => h.includes("No skip list")));
  ok("hints: 6스텝이라 fewSteps는 안 뜸", !hints.some((h) => h.includes("fill the 30-second")));
  ok("hints: expect 다 있어 noExpect는 안 뜸", !hints.some((h) => h.includes("have no expect")));

  // ───────── ② 초안 PATCH로 대본을 고치면 점검표도 갱신 ─────────
  const id = a.body?.projectId;
  if (id) {
    const fixed = {
      steps: [
        { goal: "제목", selector: "h1", action: "focus", expect: "Example Domain" },
        { goal: "본문", selector: "p", action: "click", expect: "설명" },
        { goal: "링크", selector: "a[href]", action: "click", expect: "IANA" },
        { goal: "본문2", selector: "body > div", action: "hover", expect: "박스" },
      ],
      skip: ["없음"],
    };
    const p = await patch(id, { demoScript: fixed });
    ok("PATCH 대본 → 200", p.status === 200, `status ${p.status} ${JSON.stringify(p.body).slice(0, 160)}`);
    const rv2 = p.body?.accepted?.scriptReview;
    ok("PATCH 에코에도 점검표: 4스텝·조작 2·셀렉터 4/4 찾음", rv2?.steps === 4 && rv2?.interactive === 2 && rv2?.selectors?.found === 4 && rv2?.selectors?.missing?.length === 0, JSON.stringify(rv2).slice(0, 300));
    ok("PATCH hints: 스텝 적음만 남고 셀렉터·조작 힌트는 사라짐",
      (rv2?.hints ?? []).some((h) => h.includes("fill the 30-second")) &&
      !(rv2?.hints ?? []).some((h) => h.includes("NOT found") || h.includes("actually interact")),
      (rv2?.hints ?? []).join(" | ").slice(0, 200));
  } else {
    ok("PATCH 검사 실행", false, "①이 실패해 초안 id가 없음");
  }

  // ───────── ③ 영상 동봉 = 자동 촬영 없음 → 점검표 없음 ─────────
  const v = await post({ ...BASE, title: `__probe_review_v_${run}__`, deployUrl: `https://example.com/?probe=${run}-v`, uploads: ["video"] });
  ok("영상 동봉 → 200", v.status === 200, `status ${v.status}`);
  ok("영상 동봉 → scriptReview 없음", v.body?.accepted && !("scriptReview" in v.body.accepted), JSON.stringify(Object.keys(v.body?.accepted ?? {})));
} finally {
  for (const pid of made) {
    const { data } = await svc.storage.from("project-files").list(`${prof.id}/${pid}`, { limit: 100 });
    const keys = (data ?? []).filter((f) => f.id).map((f) => `${prof.id}/${pid}/${f.name}`);
    if (keys.length) await svc.storage.from("project-files").remove(keys);
    await svc.from("projects").delete().eq("id", pid);
  }
  await svc.from("api_tokens").delete().eq("id", tok.id);
  console.log(`\n정리 완료: 프로젝트 ${made.length}건 · 토큰 1건`);
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
