// 품질 게이트 3종(2026-09-03) prod E2E — 실제 nookframe.com API를 PAT로 때린다.
//
// 왜 만들었나: 사용자 인터뷰(09-03)에서 "AI가 써오는 결과가 들쭉날쭉"의 내용이
// ①소개글 카피 ②로그인 답변 대충 ③대본 부실 셋으로 좁혀졌다. 셋 다 프롬프트에
// 이미 적혀 있던 규칙인데 **게이트가 없어서** 안 지켜도 통과하던 것들이다.
// 이 레포에서 검증된 유일한 품질 레버는 "저장하지 말고 400으로 되돌려보내기"다
// (라운드 7, 2026-08-25) — AI는 에러를 읽으면 고쳐서 다시 보낸다.
//
// 검증: (1) 소개글이 한 문단·너무 긴 줄·4줄 이상·없음이면 거절, 2~3줄이면 수락
// (2) 대본 하한 3→4 상향이 실제로 걸린다 (3) goal만 적힌 목차형 대본 거절
// (4) noLogin·impossible을 한 줄로만 선언하면 거절(note 근거 요구), url 답변은 면제
// (5) 영상 동봉은 전부 면제 (6) 초안 PATCH로 되돌리는 우회도 같은 게이트에 걸린다.
// 끝나면 throwaway 정리.
//
// 사용: 레포 루트에서 `node scripts/probe-script-quality.mjs`
// 주의: ingest 발행 버킷(20/h)을 판당 ~12회 소비한다 — 같은 시간에 다른 인제스트
// 프로브를 연달아 돌리면 429가 난다. 서비스롤 키는 macOS 키체인(scripts/_secrets.mjs).
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

// 소유자를 못 박는다 — 프로브 행이 남의 프레임에 뜨면 안 된다.
const { data: prof } = await svc
  .from("profiles")
  .select("id, username")
  .eq("username", "vivestarter")
  .maybeSingle();
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
    name: "__probe_quality_delete_me__",
  })
  .select("id")
  .single();

// 통과 기준을 다 채운 기본값 — 각 검사는 여기서 한 항목만 망가뜨린다.
const GOOD_DESC = "프로브가 만든 임시 행\n곧 지워집니다";
const GOOD_ACCESS = { noLogin: true, note: "미들웨어·첫 화면에 인증 가드 없음" };
const step = (i, action = "click") => ({
  goal: `스텝 ${i}`,
  selector: `#step-${i}`,
  action,
  expect: "화면이 반응한다",
});
const GOOD_SCRIPT = { steps: [step(1), step(2), step(3), step(4, "focus")] };

let n = 0;
const made = [];
const post = async (over = {}) => {
  const body = {
    title: `__probe_quality_${++n}__`,
    deployUrl: `https://example.com/probe-quality-${n}`,
    description: GOOD_DESC,
    demoScript: GOOD_SCRIPT,
    demoAccess: GOOD_ACCESS,
    ...over,
  };
  for (const k of Object.keys(over)) if (over[k] === undefined) delete body[k];
  const res = await fetch(`${ORIGIN}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${rawToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = { status: res.status, body: await res.json().catch(() => ({})) };
  if (out.body?.projectId) made.push(out.body.projectId);
  return out;
};

const patch = async (id, body) => {
  const res = await fetch(`${ORIGIN}/api/ingest/drafts/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${rawToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

try {
  // ───────── ① 소개글 3줄 규격 ─────────
  // PAT 호출은 영어 사전 고정(shared.ts ingestAuth)이라 카피 검사도 영어로 한다.
  const noDesc = await post({ description: undefined });
  ok("소개글 없음 → 400", noDesc.status === 400, `status ${noDesc.status}`);
  ok("코드 = DESCRIPTION_SHAPE", noDesc.body?.code === "DESCRIPTION_SHAPE", JSON.stringify(noDesc.body).slice(0, 140));
  ok(
    "거절 카피가 '2~3줄로 쓰라'는 지시를 담는다",
    typeof noDesc.body?.error === "string" && noDesc.body.error.includes("2–3 short lines"),
    (noDesc.body?.error ?? "").slice(0, 160),
  );

  // 한 문단(줄바꿈 없이 길게) — 200자 상한에는 안 걸리는 길이라야 이 게이트를 증명한다.
  const para = await post({
    description: "이 앱은 할 일을 적고 태그로 묶고 오늘 할 것만 걸러서 볼 수 있게 만든 아주 평범하지만 손에 익는 작은 도구입니다",
  });
  ok("한 문단 소개글 → 400", para.status === 400, `status ${para.status}`);
  ok("코드 = DESCRIPTION_SHAPE (한 문단)", para.body?.code === "DESCRIPTION_SHAPE", JSON.stringify(para.body).slice(0, 140));

  const many = await post({ description: "한 줄\n두 줄\n세 줄\n네 줄\n다섯 줄" });
  ok("5줄 소개글 → 400", many.status === 400 && many.body?.code === "DESCRIPTION_SHAPE", `status ${many.status} ${many.body?.code}`);

  const longLine = await post({
    description: "짧은 첫 줄\n이 줄만 유독 길어서 폰 명함에서는 접히고 마지막 줄이 잘려 나갑니다\n마지막 줄",
  });
  ok("한 줄이 너무 김 → 400", longLine.status === 400 && longLine.body?.code === "DESCRIPTION_SHAPE", `status ${longLine.status} ${longLine.body?.code}`);
  ok(
    "거절 카피가 몇 번째 줄인지 정확히 짚는다 (긴 줄은 2번째)",
    typeof longLine.body?.error === "string" && longLine.body.error.startsWith("Line 2 of description"),
    (longLine.body?.error ?? "").slice(0, 120),
  );

  // ───────── ② 대본 실속 ─────────
  const thin = await post({ demoScript: { steps: [step(1), step(2), step(3)] } });
  ok("3스텝 → 400 (하한 4로 상향됨)", thin.status === 400, `status ${thin.status}`);
  ok("코드 = SCRIPT_TOO_THIN", thin.body?.code === "SCRIPT_TOO_THIN", JSON.stringify(thin.body).slice(0, 140));
  ok(
    "거절 카피가 '최소 4'를 말한다",
    typeof thin.body?.error === "string" && thin.body.error.includes("at least 4"),
    (thin.body?.error ?? "").slice(0, 140),
  );

  // goal만 있는 목차형 — 스텝 수는 채웠지만 로봇에게 알려주는 게 없다.
  const vague = await post({
    demoScript: { steps: [{ goal: "첫 화면" }, { goal: "두 번째" }, { goal: "세 번째" }, { goal: "네 번째" }] },
  });
  ok("goal만 4스텝 → 400", vague.status === 400, `status ${vague.status}`);
  ok("코드 = SCRIPT_STEPS_VAGUE", vague.body?.code === "SCRIPT_STEPS_VAGUE", JSON.stringify(vague.body).slice(0, 140));
  ok(
    "거절 카피가 action·selector를 짚는다",
    typeof vague.body?.error === "string" &&
      vague.body.error.includes("action") && vague.body.error.includes("selector"),
    (vague.body?.error ?? "").slice(0, 160),
  );

  // ───────── ③ 로그인 답변의 근거 ─────────
  const bareNoLogin = await post({ demoAccess: { noLogin: true } });
  ok("noLogin 한 줄만 → 400", bareNoLogin.status === 400, `status ${bareNoLogin.status}`);
  ok("코드 = DEMO_ACCESS_EVIDENCE", bareNoLogin.body?.code === "DEMO_ACCESS_EVIDENCE", JSON.stringify(bareNoLogin.body).slice(0, 140));
  ok(
    "거절 카피가 '랜딩이 멀쩡해 보이는 것과 다르다'를 짚는다",
    typeof bareNoLogin.body?.error === "string" &&
      bareNoLogin.body.error.includes("NOT the same as features working before login"),
    (bareNoLogin.body?.error ?? "").slice(0, 160),
  );

  const thinNote = await post({ demoAccess: { noLogin: true, note: "확인함" } });
  ok("근거가 너무 짧으면 → 400", thinNote.status === 400 && thinNote.body?.code === "DEMO_ACCESS_EVIDENCE", `status ${thinNote.status} ${thinNote.body?.code}`);

  const bareImp = await post({ demoAccess: { impossible: true } });
  ok("impossible 한 줄만 → 400", bareImp.status === 400 && bareImp.body?.code === "DEMO_ACCESS_EVIDENCE", `status ${bareImp.status} ${bareImp.body?.code}`);

  // url 답변은 이미 구체적 경로라 근거를 따로 요구하지 않는다.
  const urlAnswer = await post({ demoAccess: { url: "/demo", params: { guest: "1" } } });
  ok("url 답변은 note 없이도 수락", urlAnswer.status === 200, `status ${urlAnswer.status} ${JSON.stringify(urlAnswer.body).slice(0, 120)}`);

  // ───────── 통과선 + 면제 ─────────
  const good = await post({});
  ok("3줄 소개글·4스텝·근거 있는 noLogin → 200", good.status === 200, `status ${good.status} ${JSON.stringify(good.body).slice(0, 140)}`);
  ok("에코 = no-login", good.body?.accepted?.demoAccess === "no-login", JSON.stringify(good.body?.accepted?.demoAccess));
  ok("에코 소개글 = 2줄", good.body?.accepted?.descriptionLines === 2, String(good.body?.accepted?.descriptionLines));

  // 직접 만든 영상은 자동 촬영 자체를 건너뛰므로 대본·로그인 게이트가 면제된다
  // (소개글은 명함에 뜨는 글이라 면제가 아니다 — 이 구분이 이번 라운드의 설계).
  const withVideo = await post({ demoScript: undefined, demoAccess: undefined, uploads: ["video"] });
  ok("영상 동봉 → 대본·로그인 게이트 면제", withVideo.status === 200, `status ${withVideo.status} ${JSON.stringify(withVideo.body).slice(0, 120)}`);

  // ───────── ④ 수정 경로 우회 차단 ─────────
  const draftId = good.body?.projectId;
  if (draftId) {
    const p1 = await patch(draftId, { description: "한 줄로 되돌려봄" });
    ok("PATCH로 소개글 1줄 되돌리기 → 400", p1.status === 400 && p1.body?.code === "DESCRIPTION_SHAPE", `status ${p1.status} ${p1.body?.code}`);

    const p2 = await patch(draftId, {
      demoScript: { steps: [{ goal: "하나" }, { goal: "둘" }, { goal: "셋" }, { goal: "넷" }] },
    });
    ok("PATCH로 목차형 대본 → 400", p2.status === 400 && p2.body?.code === "SCRIPT_STEPS_VAGUE", `status ${p2.status} ${p2.body?.code}`);

    const p3 = await patch(draftId, { demoAccess: { noLogin: true } });
    ok("PATCH로 근거 지우기 → 400", p3.status === 400 && p3.body?.code === "DEMO_ACCESS_EVIDENCE", `status ${p3.status} ${p3.body?.code}`);

    const p4 = await patch(draftId, { description: "고쳐 쓴 첫 줄\n고쳐 쓴 둘째 줄\n라이브 포트폴리오" });
    ok("PATCH로 제대로 고치면 → 200", p4.status === 200, `status ${p4.status} ${JSON.stringify(p4.body).slice(0, 120)}`);
  } else {
    ok("PATCH 우회 검사 실행", false, "통과 케이스가 실패해 초안 id가 없음");
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
