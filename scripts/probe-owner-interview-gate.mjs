// 주인 인터뷰 게이트(2026-09-29, 필수) prod E2E — 실제 nookframe.com API를 PAT로 때린다.
//
// 왜 만들었나: 데모는 진짜 앱과 같지 않고, 어디가 중요한지는 만든 사람만 안다(사용자 확정:
// "인터뷰는 필수로 하자"). 올리는 AI가 주인에게 먼저 묻고 그 말 그대로 ownerInterview에 싣지
// 않으면 저장하지 않는다. 답은 비공개 칸(가릴 것 목록이 들어 있다)이다.
//
// 검증: (0) 칸 두 개 존재(마이그레이션 적용 확인) (1) 없음=400 OWNER_INTERVIEW_REQUIRED + 영어 카피
// (2) 자리 채우기("N/A")=400 INCOMPLETE (3) 너무 긴 답=400 TOO_LONG (4) 영상 동봉도 면제 아님
// (5) 사전 검사(dryRun)=200 + 에코(답 3·가릴 것 2), 행 없음 (6) 발행=행에 답 저장, 익명 키로는
// 그 칸을 못 읽음 (7) PATCH로 비우기·자리 채우기=400, 고치기=200 + 행 갱신. 끝나면 throwaway 정리.
//
// 사용: 레포 루트에서 `node scripts/probe-owner-interview-gate.mjs`
// 주의: ingest 발행 버킷(20/h)을 1회, 시도 버킷을 6회, 관리 버킷을 3회 소비한다.
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

// (0) 마이그레이션이 먼저다 — 칸이 없으면 게이트는 통과해도 답이 저장되지 않는다(디그레이드).
{
  const { error } = await svc.from("projects").select("owner_interview, owner_interview_confirmed_at").limit(1);
  ok("projects.owner_interview·owner_interview_confirmed_at 칸 존재", !error, error ? `${error.code} ${error.message}` : "");
  if (error) {
    console.error("supabase/migration_owner_interview.sql을 먼저 적용하세요.");
    process.exit(1);
  }
}

const { data: prof } = await svc.from("profiles").select("id").eq("username", "vivestarter").maybeSingle();
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
    name: "__probe_interview_delete_me__",
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
const INTERVIEW = {
  proudMoment: "프로브가 고른 자랑 장면",
  howIUse: "프로브가 매번 확인용으로 씀",
  mustSee: "프로브 확인 문구",
  hide: ["금액", "폴더 경로"],
};
const STAMP = Date.now();
let n = 0;
const post = async (extra, { dryRun = false } = {}) => {
  const res = await fetch(`${ORIGIN}/api/ingest${dryRun ? "?dryRun=1" : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `__probe_interview_${++n}__`,
      description: "프로브가 만든 임시 행\n곧 지워집니다",
      deployUrl: `https://example.com/probe-interview-${STAMP}-${n}`,
      demoScript: SCRIPT,
      demoAccess: { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" },
      targetDevice: "desktop",
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
const interviewOf = async (id) =>
  (await svc.from("projects").select("owner_interview").eq("id", id).maybeSingle()).data?.owner_interview;

try {
  // (1) 없으면 저장하지 않는다 — 거절 문구가 곧 AI에게 주는 지시문이다.
  const bare = keep(await post({}));
  ok("인터뷰 없음 → 400 OWNER_INTERVIEW_REQUIRED", bare.status === 400 && bare.body?.code === "OWNER_INTERVIEW_REQUIRED", `${bare.status} ${bare.body?.code}`);
  ok(
    "거절 카피가 세 질문과 '주인에게 묻고 기다려라'를 말한다",
    typeof bare.body?.error === "string" &&
      ["proudMoment", "howIUse", "mustSee", "WAIT"].every((k) => bare.body.error.includes(k)),
    (bare.body?.error ?? "").slice(0, 160),
  );

  // (2) 자리 채우기는 빈 답이다.
  const filler = keep(await post({ ownerInterview: { ...INTERVIEW, mustSee: "N/A" } }));
  ok("mustSee \"N/A\" → 400 OWNER_INTERVIEW_INCOMPLETE", filler.status === 400 && filler.body?.code === "OWNER_INTERVIEW_INCOMPLETE" && (filler.body?.error ?? "").includes("mustSee"), `${filler.status} ${filler.body?.code}`);

  // (3) 너무 긴 답.
  const long = keep(await post({ ownerInterview: { ...INTERVIEW, howIUse: "가".repeat(301) } }));
  ok("301자 답 → 400 OWNER_INTERVIEW_TOO_LONG", long.status === 400 && long.body?.code === "OWNER_INTERVIEW_TOO_LONG", `${long.status} ${long.body?.code}`);

  // (4) 영상 동봉은 대본·로그인 게이트만 면제한다 — 주인의 말은 여전히 필요하다.
  const video = keep(await post({ demoScript: undefined, demoAccess: undefined, uploads: ["video"] }));
  ok("영상 동봉 + 인터뷰 없음 → 400", video.status === 400 && video.body?.code === "OWNER_INTERVIEW_REQUIRED", `${video.status} ${video.body?.code}`);

  // (5) 사전 검사 — 같은 판정, 저장 없음.
  const beforeCount = (await svc.from("projects").select("id", { count: "exact", head: true }).eq("user_id", prof.id)).count;
  const dry = await post({ ownerInterview: INTERVIEW }, { dryRun: true });
  const afterCount = (await svc.from("projects").select("id", { count: "exact", head: true }).eq("user_id", prof.id)).count;
  ok("dryRun → 200 + 에코(답 3·가릴 것 2)", dry.status === 200 && dry.body?.dryRun === true &&
    dry.body?.accepted?.ownerInterview?.answered === 3 && dry.body?.accepted?.ownerInterview?.hidden === 2,
  JSON.stringify(dry.body?.accepted?.ownerInterview));
  ok("dryRun은 행을 만들지 않는다", beforeCount === afterCount, `${beforeCount} → ${afterCount}`);
  ok("에코에 답 글은 없다(가릴 것은 비공개)", !JSON.stringify(dry.body ?? {}).includes("폴더 경로"));

  // (6) 발행 — 행에 답이 저장되고, 익명 키로는 그 칸을 못 읽는다.
  const good = keep(await post({ ownerInterview: INTERVIEW }));
  ok("인터뷰 포함 발행 → 200", good.status === 200 && !!good.body?.projectId, `${good.status} ${good.body?.code ?? ""}`);
  if (good.body?.projectId) {
    const id = good.body.projectId;
    const stored = await interviewOf(id);
    ok("행에 답 저장(가릴 것 포함)", stored?.mustSee === INTERVIEW.mustSee && stored?.hide?.join("|") === "금액|폴더 경로", JSON.stringify(stored));
    const anon = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/projects?select=owner_interview&limit=1`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
    });
    const anonBody = await anon.json().catch(() => ({}));
    ok("익명 키로 owner_interview 읽기 거절(칸 단위 권한)", anon.status >= 400 && /42501|permission/i.test(JSON.stringify(anonBody)), `${anon.status} ${JSON.stringify(anonBody).slice(0, 120)}`);

    // (7) 수정 경로.
    const patch = async (body) => {
      const res = await fetch(`${ORIGIN}/api/ingest/drafts/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };
    const clear = await patch({ ownerInterview: null });
    ok("PATCH로 비우기 → 400", clear.status === 400 && clear.body?.code === "OWNER_INTERVIEW_REQUIRED", `${clear.status} ${clear.body?.code}`);
    const fill = await patch({ ownerInterview: { ...INTERVIEW, proudMoment: "없음" } });
    ok("PATCH로 자리 채우기 → 400", fill.status === 400 && fill.body?.code === "OWNER_INTERVIEW_INCOMPLETE", `${fill.status} ${fill.body?.code}`);
    ok("거절 뒤 행은 그대로", (await interviewOf(id))?.proudMoment === INTERVIEW.proudMoment);
    const edit = await patch({ ownerInterview: { ...INTERVIEW, mustSee: "고친 확인 문구", hide: "금액" } });
    ok("PATCH로 고치기 → 200 + 에코(가릴 것 1)", edit.status === 200 && edit.body?.accepted?.ownerInterview?.hidden === 1, `${edit.status} ${JSON.stringify(edit.body?.accepted?.ownerInterview)}`);
    const after = await interviewOf(id);
    ok("PATCH가 행을 갱신(쉼표 글도 목록으로)", after?.mustSee === "고친 확인 문구" && after?.hide?.join("|") === "금액", JSON.stringify(after));
  } else {
    ok("저장·PATCH 검사 실행", false, "발행이 실패해 초안 id가 없음");
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
