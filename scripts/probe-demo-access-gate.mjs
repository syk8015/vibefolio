// 로그인 답변 게이트(2026-08-27) prod E2E — 실제 nookframe.com API를 PAT로 때린다.
//
// 왜 만들었나: 조사 결과 한국 바이브코딩 작품에서 가장 큰 촬영 실패군이 "로그인
// 뒤에야 기능이 도는 앱"이었다. 이건 실패로 잡히지도 않는다 — 로그인 화면이든
// 빈 껍데기든 화면은 떴으니 blank 가드를 통과한다. 그래서 demoAccess를 선택에서
// **필수**로 올렸다: url · noLogin · impossible 셋 중 하나로 답해야 저장한다.
//
// 검증: (1) 답 없음=400 DEMO_ACCESS_REQUIRED (2) noLogin 수락 (3) impossible 수락
// (4) url 수락 (5) loginRequired:false 별칭 수락 (6) 영상 동봉=면제 (7) 초안 PATCH로
// 답을 비우면 400 (8) 에코가 세 답을 구별해 보여준다. 끝나면 throwaway 정리.
//
// 사용: 레포 루트에서 `node scripts/probe-demo-access-gate.mjs`
// 주의: ingest 발행 버킷(20/h)을 판당 ~7회, 관리 버킷을 ~2회 소비한다.
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
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

// 소유자는 아무 프로필이나 집지 않는다 — 프로브 행이 남의 프레임에 뜨면 안 된다.
const { data: prof } = await svc
  .from("profiles")
  .select("id, username")
  .eq("username", "vivestarter")
  .maybeSingle();
if (!prof) {
  console.error("프로브 소유자(vivestarter) 프로필을 못 찾았어요.");
  process.exit(1);
}

const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc
  .from("api_tokens")
  .insert({
    user_id: prof.id,
    token_hash: createHash("sha256").update(raw).digest("hex"),
    token_prefix: `${raw.slice(0, 14)}…`,
    name: "__probe_access_delete_me__",
  })
  .select("id")
  .single();

const SCRIPT = {
  steps: [
    { goal: "첫 화면", selector: "#a", action: "click", expect: "열린다" },
    { goal: "두 번째", selector: "#b", action: "click", expect: "반응한다" },
    { goal: "결과", selector: "#c", action: "focus", expect: "결과가 보인다" },
    { goal: "되돌아오기", selector: "#d", action: "click", expect: "첫 화면으로 돌아온다" },
  ],
};

let n = 0;
const post = async (extra) => {
  const res = await fetch(`${ORIGIN}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `__probe_access_${++n}__`,
      description: "프로브가 만든 임시 행\n곧 지워집니다",
      deployUrl: `https://example.com/probe-access-${n}`,
      demoScript: SCRIPT,
      ...extra,
    }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const made = [];
const keep = (r) => {
  if (r.body?.projectId) made.push(r.body.projectId);
  return r;
};

try {
  // (1) 답이 없으면 저장하지 않는다 — 이게 이번 라운드의 본체다.
  const bare = await post({});
  ok("답 없음 → 400", bare.status === 400, `status ${bare.status}`);
  ok("코드 = DEMO_ACCESS_REQUIRED", bare.body?.code === "DEMO_ACCESS_REQUIRED", JSON.stringify(bare.body).slice(0, 160));
  // PAT 호출은 영어 사전 고정(기계·AI 호출자, shared.ts ingestAuth) — 카피 검사도 영어로.
  ok(
    "거절 카피가 '로그인해야 비로소 동작하는 앱'을 짚는다",
    typeof bare.body?.error === "string" && bare.body.error.includes("only comes alive after you log in"),
    (bare.body?.error ?? "").slice(0, 140),
  );
  ok(
    "거절 카피가 세 가지 답을 다 제시한다",
    typeof bare.body?.error === "string" &&
      ["noLogin", "impossible", '"url"'].every((k) => bare.body.error.includes(k)),
    (bare.body?.error ?? "").slice(0, 200),
  );

  // 빈 객체·모르는 키만 있는 것도 "답 안 함"과 같다(조용히 통과시키면 게이트가 무의미).
  const empty = keep(await post({ demoAccess: { note: "그냥 메모" } }));
  ok("note만 있는 demoAccess → 400", empty.status === 400, `status ${empty.status}`);

  // (2)~(5) 세 가지 답 + 별칭은 모두 통과한다.
  const noLogin = keep(await post({ demoAccess: { noLogin: true, note: "미들웨어·첫 화면에 인증 가드 없음" } }));
  ok("noLogin: true → 수락", noLogin.status === 200, `status ${noLogin.status}`);
  ok("에코가 no-login으로 구별해 보여준다", noLogin.body?.accepted?.demoAccess === "no-login", JSON.stringify(noLogin.body?.accepted?.demoAccess));

  const imp = keep(await post({ demoAccess: { impossible: true, note: "E2E 암호화라 게스트 진입 불가" } }));
  ok("impossible: true → 수락", imp.status === 200, `status ${imp.status}`);
  ok("에코 = impossible", imp.body?.accepted?.demoAccess === "impossible", JSON.stringify(imp.body?.accepted?.demoAccess));

  const url = keep(await post({ demoAccess: { url: "/demo", params: { guest: "1" }, note: "게스트 모드" } }));
  ok("url 경로 → 수락", url.status === 200, `status ${url.status}`);
  ok("에코 = /demo", url.body?.accepted?.demoAccess === "/demo", JSON.stringify(url.body?.accepted?.demoAccess));

  const alias = keep(await post({ demoAccess: { loginRequired: false, note: "미들웨어·첫 화면에 인증 가드 없음" } }));
  ok("loginRequired: false 별칭 → 수락", alias.status === 200, `status ${alias.status}`);
  ok("별칭도 no-login으로 저장", alias.body?.accepted?.demoAccess === "no-login", JSON.stringify(alias.body?.accepted?.demoAccess));

  // (6) 직접 만든 영상은 자동 촬영 자체를 건너뛰므로 대본과 함께 면제된다.
  const withVideo = keep(
    await post({ demoScript: undefined, uploads: ["video"] }),
  );
  ok("영상 동봉(uploads:[video]) → 게이트 면제", withVideo.status === 200, `status ${withVideo.status} ${JSON.stringify(withVideo.body).slice(0, 120)}`);

  // (7) 수정 경로로 답을 비우는 우회를 막는다.
  if (noLogin.body?.projectId) {
    const res = await fetch(`${ORIGIN}/api/ingest/drafts/${noLogin.body.projectId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
      body: JSON.stringify({ demoAccess: { note: "지워봄" } }),
    });
    const body = await res.json().catch(() => ({}));
    ok("PATCH로 답 비우기 → 400", res.status === 400, `status ${res.status}`);
    ok("PATCH 코드 = DEMO_ACCESS_REQUIRED", body?.code === "DEMO_ACCESS_REQUIRED", JSON.stringify(body).slice(0, 140));

    const good = await fetch(`${ORIGIN}/api/ingest/drafts/${noLogin.body.projectId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
      body: JSON.stringify({ demoAccess: { url: "/demo2" } }),
    });
    ok("PATCH로 다른 답으로 바꾸기 → 200", good.status === 200, `status ${good.status}`);
  } else {
    ok("PATCH 검사 실행", false, "생성이 실패해 초안 id가 없음");
  }
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
