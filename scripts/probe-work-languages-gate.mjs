// 작품 두 언어 게이트(2026-09-29, 필수) prod E2E — 실제 nookframe.com API를 PAT로 때린다.
//
// 왜 만들었나: 영미권이 주 대상인데 올라오는 앱은 대부분 한국어 화면뿐이다(사용자 확정: 두 언어 작품).
// 모든 작품이 두 언어 글을 갖고, 앱 화면이 못 보여주는 언어는 장면 자막으로 채운다(lib/workLanguages.ts).
//
// 검증: (0) 칸 세 개 존재 (1) language 없음 (2) appLanguages 없음 + '영어판 물어보기' 카피 (3) translation 없음
// (4) 다른 언어 소개글 3줄 규격 (5) 한국어뿐 앱의 자막 없는 대본(뒤로가기 면제) (6) 영상 동봉은 자막 면제
// (7) 사전 검사 에코 (8) 발행 = 저장 + 익명 키로 읽힘(공개 칸) (9) PATCH는 합친 상태로 판정. 끝나면 정리.
//
// 사용: 레포 루트에서 `node scripts/probe-work-languages-gate.mjs`
// 주의: ingest 발행 버킷(20/h)을 1회, 시도 버킷을 5회, 검사 버킷을 2회, 관리 버킷을 4회 소비한다.
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { wipeProbeDraft } from "./_probeFiles.mjs";
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

// (0) 마이그레이션이 먼저다 — 칸이 없으면 게이트는 통과해도 값이 저장되지 않는다(디그레이드).
{
  const { error } = await svc.from("projects").select("primary_locale, app_locales, translations").limit(1);
  ok("projects.primary_locale·app_locales·translations 칸 존재", !error, error ? `${error.code} ${error.message}` : "");
  if (error) {
    console.error("supabase/migration_work_languages.sql을 먼저 적용하세요.");
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
    name: "__probe_languages_delete_me__",
  })
  .select("id")
  .single();

const SCRIPT = {
  steps: [
    { goal: "첫 화면", selector: "#a", action: "click", expect: "열린다" },
    { goal: "두 번째", selector: "#b", action: "click", expect: "반응한다" },
    { goal: "결과", selector: "#c", action: "focus", expect: "결과가 보인다" },
    { goal: "되돌아오기", selector: "#d", action: "click", expect: "첫 화면으로 돌아온다" },
    { goal: "뒤로", action: "navigate", to: "back" },
  ],
};
const EN = ["Opens the first screen.", "Reacts right away.", "Here is the result.", "Back where we started."];
const CAPTIONED = { ...SCRIPT, steps: SCRIPT.steps.map((s, i) => (EN[i] ? { ...s, caption: { en: EN[i] } } : s)) };
const TRANSLATION = { title: "Probe", description: "A temporary row made by a probe\nDeleted right away", builderNote: "Made by a probe" };
const INTERVIEW = { proudMoment: "프로브가 고른 자랑 장면", howIUse: "프로브가 매번 확인용으로 씀", mustSee: "프로브 확인 문구" };
const STAMP = Date.now();
let n = 0;
const post = async (extra, { dryRun = false } = {}) => {
  const res = await fetch(`${ORIGIN}/api/ingest${dryRun ? "?dryRun=1" : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `__probe_languages_${++n}__`,
      description: "프로브가 만든 임시 행\n곧 지워집니다",
      deployUrl: `https://example.com/probe-languages-${STAMP}-${n}`,
      demoScript: CAPTIONED,
      demoAccess: { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" },
      targetDevice: "desktop",
      ownerInterview: INTERVIEW,
      language: "ko",
      appLanguages: ["ko"],
      translation: TRANSLATION,
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
const rowOf = async (id) =>
  (await svc.from("projects").select("primary_locale, app_locales, translations, demo_script").eq("id", id).maybeSingle()).data;
const is400 = (r, code) => r.status === 400 && r.body?.code === code;

try {
  // (1)~(5) 저장하지 않는 거절들 — 거절 문구가 곧 AI에게 주는 지시문이다.
  const noLang = keep(await post({ language: undefined }));
  ok("language 없음 → 400 LANGUAGE_REQUIRED", is400(noLang, "LANGUAGE_REQUIRED"), `${noLang.status} ${noLang.body?.code}`);
  const noApp = keep(await post({ appLanguages: undefined }));
  ok("appLanguages 없음 → 400 APP_LANGUAGES_REQUIRED", is400(noApp, "APP_LANGUAGES_REQUIRED"), `${noApp.status} ${noApp.body?.code}`);
  ok("거절 카피가 '영어판도 만들어 드릴까요'를 주인에게 묻게 한다",
    typeof noApp.body?.error === "string" && noApp.body.error.includes("Should I add an English version"), (noApp.body?.error ?? "").slice(0, 160));
  const noTr = keep(await post({ translation: undefined }));
  ok("translation 없음 → 400 TRANSLATION_REQUIRED", is400(noTr, "TRANSLATION_REQUIRED"), `${noTr.status} ${noTr.body?.code}`);
  const flatTr = keep(await post({ translation: { title: "Probe", description: "one paragraph only" } }));
  ok("translation 소개글 한 줄 → 400 TRANSLATION_SHAPE", is400(flatTr, "TRANSLATION_SHAPE"), `${flatTr.status} ${flatTr.body?.code}`);
  const noCap = keep(await post({ demoScript: SCRIPT }));
  ok("한국어뿐 앱 + 자막 없는 대본 → 400 CAPTIONS_REQUIRED(1~4번, 뒤로가기 빼고)",
    is400(noCap, "CAPTIONS_REQUIRED") && /step 1, 2, 3, 4\b/.test(noCap.body?.error ?? ""), `${noCap.status} ${noCap.body?.code} ${(noCap.body?.error ?? "").slice(0, 80)}`);

  // (6) 직접 만든 영상은 자막 면제 · (7) 사전 검사 에코 — 둘 다 행을 만들지 않는다.
  const video = await post({ demoScript: undefined, uploads: ["video"] }, { dryRun: true });
  ok("영상 동봉(사전 검사) → 자막 없이 200", video.status === 200 && video.body?.dryRun === true, `${video.status} ${video.body?.code}`);
  const dry = await post({}, { dryRun: true });
  const L = dry.body?.accepted?.languages;
  ok("사전 검사 에코: 한국어로 1번 촬영 · 영어 자막 4장면 · 영어 제목",
    dry.status === 200 && L?.film?.join() === "ko" && L?.captionLanguages?.join() === "en" && L?.captionSteps?.en === 4 && L?.translation?.locale === "en" && L?.translation?.title === "Probe",
    `${dry.status} ${JSON.stringify(L)}`);

  // (8) 발행 = 행에 저장, 세 칸은 공개 칸이라 익명 키로도 읽힌다(명함이 언어 판을 고른다).
  const good = keep(await post({}));
  ok("발행 → 200", good.status === 200 && !!good.body?.projectId, `${good.status} ${good.body?.code ?? ""}`);
  const id = good.body?.projectId;
  if (id) {
    const row = await rowOf(id);
    ok("행에 언어 저장", row?.primary_locale === "ko" && row?.app_locales?.join() === "ko" && row?.translations?.en?.title === "Probe"
      && row?.demo_script?.steps?.[0]?.caption?.en === EN[0], JSON.stringify({ ...row, demo_script: row?.demo_script?.steps?.[0] }));
    const anon = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/projects?select=primary_locale,app_locales,translations&limit=1`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
    });
    ok("익명 키로 세 칸 읽기 허락(공개 칸)", anon.status === 200, `${anon.status}`);

    // (9) 수정 경로 — 합친 상태로 판정한다.
    const patch = async (b) => {
      const res = await fetch(`${ORIGIN}/api/ingest/drafts/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
        body: JSON.stringify(b),
      });
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };
    const dropCaps = await patch({ demoScript: SCRIPT });
    ok("PATCH 대본만 바꿔 자막을 빼면 → 400 CAPTIONS_REQUIRED", is400(dropCaps, "CAPTIONS_REQUIRED"), `${dropCaps.status} ${dropCaps.body?.code}`);
    const flip = await patch({ language: "en" });
    ok("PATCH 기본 언어만 en으로 → 400 TRANSLATION_REQUIRED(한국어 판이 없다)", is400(flip, "TRANSLATION_REQUIRED"), `${flip.status} ${flip.body?.code}`);
    ok("거절 뒤 행은 그대로", (await rowOf(id))?.primary_locale === "ko");
    const both = await patch({ appLanguages: ["ko", "en"], translation: { ...TRANSLATION, title: "Probe v2" } });
    ok("PATCH 앱 두 언어 + 번역 고치기 → 200 + 에코(두 번 촬영, 자막 없음)",
      both.status === 200 && both.body?.accepted?.languages?.film?.join() === "ko,en" && both.body?.accepted?.languages?.captionLanguages?.length === 0,
      `${both.status} ${JSON.stringify(both.body?.accepted?.languages ?? both.body?.code)}`);
    const after = await rowOf(id);
    ok("PATCH가 행을 갱신", after?.app_locales?.join() === "ko,en" && after?.translations?.en?.title === "Probe v2", JSON.stringify({ a: after?.app_locales, t: after?.translations }));
    const nowFree = await patch({ demoScript: SCRIPT });
    ok("두 언어 앱이 된 뒤엔 자막 없는 대본도 200", nowFree.status === 200, `${nowFree.status} ${nowFree.body?.code}`);
  } else {
    ok("저장·PATCH 검사 실행", false, "발행이 실패해 초안 id가 없음");
  }
} finally {
  for (const pid of made) {
    await wipeProbeDraft({ svc, token: raw, id: pid });
  }
  await svc.from("api_tokens").delete().eq("id", tok.id);
  console.log(`\n정리 완료: 프로젝트 ${made.length}건 · 토큰 1건`);
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
