// 소개 영상(화면 없는 작품, 2026-10-02) 입구 prod E2E — 실제 nookframe.com API를 PAT로 때린다.
//
// 왜: 찍을 화면이 없는 작품(CLI·백엔드·기기)은 로봇 촬영 대신 장면 대본을 보내고 명함이 그 자리에서 재생한다
// (docs/intro-film.md). 대본만 있으면 진입 주소·촬영 대본·로그인 답 없이도 받아야 하고, 대본이 틀리면 칸 경로와
// 함께 되돌려보내야 한다.
//
// 검증: (0) 칸 두 개 존재 (1) 대본만으로 사전 검사 통과 + 에코 (2) 한국어 빠진 대본 → 400 칸 경로
// (3) 대본도 주소도 없으면 여전히 NO_ARTIFACT (4) 발행 = 저장 + 익명 키로 읽힘 + 대상 화면 기본 PC + 촬영 상태 없음
// (5) 초안 PATCH로 스타일 바꾸기·틀린 값 거절. 끝나면 정리.
//
// 사용: 레포 루트에서 `node scripts/probe-intro-film-gate.mjs`
// 주의: ingest 발행 버킷(20/h) 1회, 시도 버킷 2회, 검사 버킷 1회, 관리 버킷 2회를 쓴다.
import "./_secrets.mjs";
import { wipeProbeDraft } from "./_probeFiles.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

{
  const { error } = await svc.from("projects").select("intro_film, intro_render").limit(1);
  ok("(0) projects.intro_film·intro_render 칸 존재", !error, error ? `${error.code} ${error.message}` : "");
  if (error) { console.error("supabase/migration_intro_film.sql을 먼저 적용하세요."); process.exit(1); }
}

const { data: prof } = await svc.from("profiles").select("id").eq("username", "vivestarter").maybeSingle();
if (!prof) { console.error("프로브 소유자(vivestarter) 프로필을 못 찾았어요."); process.exit(1); }
const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc.from("api_tokens").insert({
  user_id: prof.id, token_hash: createHash("sha256").update(raw).digest("hex"),
  token_prefix: `${raw.slice(0, 14)}…`, name: "__probe_intro_film_delete_me__",
}).select("id").single();

const l = (en, ko) => ({ en, ko });
const FILM = {
  style: { text: "bignum", mood: "cinematic" },
  scenes: [
    { kind: "hook", label: l("PROBE", "프로브"), value: "68%", line: l("A probe made this.", "프로브가 만들었어요."), data: "sample" },
    { kind: "story", line: l("It checks the gate", "입구를 확인하고"), line2: l("then disappears.", "곧 지워져요.") },
    { kind: "ending", line: l("Built by a probe,", "프로브가 만들었어요,"), line2: l("for a test.", "시험용으로."), name: l("INTRO FILM PROBE", "소개 영상 프로브") },
  ],
};
const BASE = {
  title: "__probe_intro_film__",
  description: "프로브가 만든 임시 행\n곧 지워집니다",
  language: "ko", appLanguages: ["ko"],
  translation: { title: "Probe", description: "A temporary row made by a probe\nDeleted right away", builderNote: "Made by a probe" },
  ownerInterview: { proudMoment: "프로브가 고른 자랑 장면", howIUse: "프로브가 매번 확인용으로 씀", mustSee: "프로브 확인 문구" },
  newDraft: true,
};
const post = async (body, { dryRun = false } = {}) => {
  const res = await fetch(`${ORIGIN}/api/ingest${dryRun ? "?dryRun=1" : ""}`, {
    method: "POST", headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const patch = async (id, body) => {
  const res = await fetch(`${ORIGIN}/api/ingest/drafts/${id}`, {
    method: "PATCH", headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let pid = null;
try {
  const r1 = await post({ ...BASE, introFilm: FILM }, { dryRun: true });
  ok("(1a) 대본만으로 사전 검사 통과(주소·촬영 대본·로그인 답 없음)", r1.status === 200 && r1.body.ok === true, `${r1.status} ${r1.body.code ?? ""} ${r1.body.message ?? ""}`);
  ok("(1b) 에코에 장면·길이·스타일", r1.body.introFilm?.scenes?.length === 3 && r1.body.introFilm?.seconds > 10 && r1.body.introFilm?.style?.mood === "cinematic", JSON.stringify(r1.body.introFilm));

  const bad = structuredClone(FILM); bad.scenes[0].line = { en: "Only English" };
  const r2 = await post({ ...BASE, introFilm: bad });
  ok("(2) 한국어 빠진 대본 → 400 INTRO_FILM_INVALID + 칸 경로", r2.status === 400 && r2.body.code === "INTRO_FILM_INVALID" && r2.body.field === "introFilm.scenes[0].line.ko", `${r2.status} ${r2.body.code} ${r2.body.field}`);

  const r3 = await post({ ...BASE }, { dryRun: true });
  ok("(3) 대본도 주소도 없으면 그대로 거절", r3.status === 400, `${r3.status} ${r3.body.code}`);

  const r4 = await post({ ...BASE, introFilm: FILM });
  pid = r4.body.projectId ?? null;
  ok("(4a) 발행 200", r4.status === 200 && !!pid, `${r4.status} ${r4.body.code ?? ""} ${r4.body.message ?? ""}`);
  if (pid) {
    const { data: row } = await svc.from("projects").select("intro_film, target_device, demo_build_status, demo_url, is_draft").eq("id", pid).single();
    ok("(4b) 대본 저장", row?.intro_film?.scenes?.length === 3, JSON.stringify(row?.intro_film?.style));
    ok("(4c) 대상 화면 기본 PC", row?.target_device === "desktop", row?.target_device);
    ok("(4d) 촬영 상태 없음(인제스트는 촬영 칸을 안 쓴다)", row?.demo_build_status == null, String(row?.demo_build_status));
    // 공개 칸 확인 — 익명 키는 초안 행을 못 보므로(RLS) 칸 권한 오류가 아닌지만 본다.
    const { error: anonErr } = await anon.from("projects").select("intro_film, intro_render").limit(1);
    ok("(4e) 익명 키로 두 칸 읽기 허락(공개 칸)", !anonErr, anonErr ? `${anonErr.code} ${anonErr.message}` : "");

    const r5 = await patch(pid, { introFilm: { ...FILM, style: { text: "hand", mood: "hand" } } });
    const { data: row2 } = await svc.from("projects").select("intro_film").eq("id", pid).single();
    ok("(5a) PATCH로 스타일 바꾸기", r5.status === 200 && row2?.intro_film?.style?.text === "hand", `${r5.status} ${r5.body.code ?? ""}`);
    const r6 = await patch(pid, { introFilm: { ...FILM, style: { text: "neon", mood: "hand" } } });
    ok("(5b) 틀린 스타일 → 400 칸 경로", r6.status === 400 && r6.body.field === "introFilm.style.text", `${r6.status} ${r6.body.field}`);
  }
} finally {
  if (pid) await wipeProbeDraft({ svc, token: raw, id: pid, origin: ORIGIN });
  await svc.from("api_tokens").delete().eq("id", tok.id);
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
