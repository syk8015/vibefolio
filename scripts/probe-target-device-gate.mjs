// 대상 화면 게이트(2026-09-15) prod E2E — 실제 nookframe.com API를 PAT로 때린다.
//
// 왜 만들었나: 초안 검토 창의 미리보기 틀(폰 402×874 / PC 1280×800)은 사람이 바꾸는
// 스위치 없이 **업로드한 AI의 답**으로만 정한다(사용자 확정). 답이 없으면 틀이 짐작이
// 되므로 targetDevice를 필수로 받는다: "mobile" · "desktop" 중 하나로 답해야 저장한다.
//
// 검증: (0) 컬럼 존재(마이그레이션 적용 확인) (1) 답 없음=400 TARGET_DEVICE_REQUIRED + 영어 카피
// (2) 엉뚱한 값=400 (3) "mobile" 수락 → 행 + accepted 에코 (4) 대소문자·공백 정규화
// (5) 영상 동봉도 면제 아님 (6) 같은 URL 재발행(upsert)이 답을 갱신 (7) 초안 PATCH로 비우기=400
// (8) PATCH로 다른 답=200 + 행 갱신 (9) DB CHECK가 두 값 밖을 거부. 끝나면 throwaway 정리.
//
// 사용: 레포 루트에서 `node scripts/probe-target-device-gate.mjs`
// 주의: ingest 발행 버킷(20/h)을 판당 6회, 관리 버킷을 2회 소비한다.
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

// (0) 마이그레이션이 먼저다 — 컬럼이 없으면 게이트는 통과해도 값이 저장되지 않는다
// (라우트는 컬럼이 없으면 그 컬럼만 빼고 저장하는 디그레이드를 탄다).
{
  const { error } = await svc.from("projects").select("target_device").limit(1);
  ok("projects.target_device 컬럼 존재", !error, error ? `${error.code} ${error.message}` : "");
  if (error) {
    console.error("supabase/migration_target_device.sql을 먼저 적용하세요.");
    process.exit(1);
  }
}

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
    name: "__probe_device_delete_me__",
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
const ACCESS = { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" };
const STAMP = Date.now();

let n = 0;
const post = async (extra, url) => {
  const res = await fetch(`${ORIGIN}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `__probe_device_${++n}__`,
      description: "프로브가 만든 임시 행\n곧 지워집니다",
      deployUrl: url ?? `https://example.com/probe-device-${STAMP}-${n}`,
      demoScript: SCRIPT,
      demoAccess: ACCESS,
      ...extra,
    }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const made = [];
const keep = (r) => {
  if (r.body?.projectId && !made.includes(r.body.projectId)) made.push(r.body.projectId);
  return r;
};
const deviceOf = async (id) =>
  (await svc.from("projects").select("target_device").eq("id", id).maybeSingle()).data?.target_device;

try {
  // (1) 답이 없으면 저장하지 않는다.
  const bare = keep(await post({}));
  ok("답 없음 → 400", bare.status === 400, `status ${bare.status}`);
  ok("코드 = TARGET_DEVICE_REQUIRED", bare.body?.code === "TARGET_DEVICE_REQUIRED", JSON.stringify(bare.body).slice(0, 160));
  // PAT 호출은 영어 사전 고정 — 카피 검사도 영어로.
  ok(
    "거절 카피가 두 답과 contentType과의 차이를 짚는다",
    typeof bare.body?.error === "string" &&
      ['"mobile"', '"desktop"', "contentType"].every((k) => bare.body.error.includes(k)),
    (bare.body?.error ?? "").slice(0, 160),
  );

  // (2) 목록 밖의 값은 답으로 치지 않는다.
  const odd = keep(await post({ targetDevice: "tablet" }));
  ok('엉뚱한 값("tablet") → 400', odd.status === 400 && odd.body?.code === "TARGET_DEVICE_REQUIRED", `status ${odd.status}`);

  // (3) 정상 답은 행과 에코 양쪽에 남는다.
  const MOBILE_URL = `https://example.com/probe-device-${STAMP}-mobile`;
  const mobile = keep(await post({ targetDevice: "mobile" }, MOBILE_URL));
  ok('"mobile" → 수락', mobile.status === 200, `status ${mobile.status} ${JSON.stringify(mobile.body).slice(0, 120)}`);
  ok("에코 = mobile", mobile.body?.accepted?.targetDevice === "mobile", JSON.stringify(mobile.body?.accepted?.targetDevice));
  if (mobile.body?.projectId) {
    ok("행 target_device = mobile", (await deviceOf(mobile.body.projectId)) === "mobile");
  }

  // (4) 대소문자·앞뒤 공백은 정규화한다.
  const spaced = keep(await post({ targetDevice: " Desktop " }));
  ok("' Desktop ' → desktop으로 저장", spaced.status === 200 && spaced.body?.accepted?.targetDevice === "desktop", JSON.stringify(spaced.body?.accepted?.targetDevice));

  // (5) 영상 동봉은 대본·로그인 게이트만 면제한다 — 대상 화면은 여전히 물어야 한다.
  const videoBare = keep(await post({ demoScript: undefined, demoAccess: undefined, uploads: ["video"] }));
  ok("영상 동봉 + 답 없음 → 400", videoBare.status === 400 && videoBare.body?.code === "TARGET_DEVICE_REQUIRED", `status ${videoBare.status}`);

  if (mobile.body?.projectId) {
    const id = mobile.body.projectId;
    // (6) 같은 URL로 다시 올리면 새 행 없이 그 초안이 갱신된다 — 답도 함께.
    const again = keep(await post({ targetDevice: "desktop" }, MOBILE_URL));
    ok(
      "같은 URL 재발행 = upsert",
      again.status === 200 && again.body?.upserted === true && again.body?.projectId === id,
      JSON.stringify({ status: again.status, upserted: again.body?.upserted }),
    );
    ok("upsert가 답을 desktop으로 갱신", (await deviceOf(id)) === "desktop");

    const patch = async (body) => {
      const res = await fetch(`${ORIGIN}/api/ingest/drafts/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };
    // (7) 수정 경로로 답을 비우는 우회를 막는다.
    const clear = await patch({ targetDevice: null });
    ok("PATCH로 답 비우기 → 400", clear.status === 400 && clear.body?.code === "TARGET_DEVICE_REQUIRED", `status ${clear.status}`);
    ok("비우기 거절 뒤 행은 그대로", (await deviceOf(id)) === "desktop");
    // (8) 다른 답으로 바꾸는 건 된다.
    const flip = await patch({ targetDevice: "mobile" });
    ok("PATCH로 다른 답 → 200 + 에코", flip.status === 200 && flip.body?.accepted?.targetDevice === "mobile", `status ${flip.status}`);
    ok("PATCH가 행을 갱신", (await deviceOf(id)) === "mobile");
  } else {
    ok("upsert·PATCH 검사 실행", false, "생성이 실패해 초안 id가 없음");
  }

  // (9) DB CHECK — 서비스롤로 직접 넣어도 두 값 밖은 거부된다(23514).
  const { data: chkRow, error: chk } = await svc
    .from("projects")
    .insert({ user_id: prof.id, title: "__probe_device_check__", is_draft: true, demo_url: "", target_device: "tablet" })
    .select("id")
    .single();
  if (chkRow?.id) made.push(chkRow.id);
  ok("DB CHECK가 두 값 밖을 거부(23514)", chk?.code === "23514", chk ? `${chk.code} ${chk.message}` : "insert가 통과해 버림");
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
