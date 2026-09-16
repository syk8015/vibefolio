// 사전 검사(dryRun, 2026-09-16) prod E2E — `nookframe check`가 쓰는 경로.
//
// 왜 만들었나: 발행을 거절하는 규칙은 전부 서버 lib에 있고 cli/는 레포 코드를 import할 수
// 없다. 그래서 검사를 CLI에 복제하는 대신 같은 라우트에 `?dryRun=1`로 물어보고 판정만 받는다
// (사용자 확정 2026-09-16). 이 프로브가 지키는 것은 두 가지다 — **같은 게이트로 답한다**,
// 그리고 **아무것도 저장하지 않는다**.
//
// 검증: (1)~(5) 게이트 4종이 dryRun에서도 같은 코드로 400 (6)~(10) 정상 payload는 200 +
// dryRun:true + accepted 에코(필름 길이 포함) + projectId 없음 (11) 행이 하나도 안 생김
// (12)(13) bundle 선언은 아티팩트로 인정하되 서명 URL은 안 준다 (14) 같은 URL이면 wouldUpdate
// + draftId (15) 공개된 행 draftId → 409 (16) payload.dryRun도 저장 안 함.
//
// 사용: 레포 루트에서 `node scripts/probe-ingest-dry-run.mjs`
// 주의: 발행 버킷(ingest 20/h)은 2회만 쓴다(실제 발행 1 + payload 경로 1), 나머지는 검사
// 버킷(ingest-check 60/h). `__probe_dry_%` 행만 만들고 지운다.
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
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${String(detail).slice(0, 200)}` : ""}`);
  if (!pass) failed++;
};

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
    name: "__probe_dryrun_delete_me__",
  })
  .select("id")
  .single();

const SCRIPT = {
  steps: [
    { goal: "첫 화면", selector: "#a", action: "click", expect: "열린다", hold: 1 },
    { goal: "입력", selector: "#b", action: "type", text: "hello", expect: "글자가 보인다" },
    { goal: "결과", selector: "#c", action: "focus", expect: "결과가 보인다" },
    { goal: "되돌아오기", selector: "#d", action: "click", expect: "첫 화면" },
  ],
  skip: ["다크모드 토글"],
};
const ACCESS = { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" };
const STAMP = Date.now();
const base = (n) => ({
  title: `__probe_dry_${n}__`,
  description: "프로브가 만든 임시 검사\n곧 지워집니다",
  deployUrl: `https://example.com/probe-dry-${STAMP}-${n}`,
  demoScript: SCRIPT,
  demoAccess: ACCESS,
  targetDevice: "desktop",
});

/** dryRun 호출 — 쿼리로 보내는 게 정규 경로(검사 버킷을 쓰려면 파싱 전에 알아야 한다). */
const check = async (payload, { viaPayload = false } = {}) => {
  const res = await fetch(`${ORIGIN}/api/ingest${viaPayload ? "" : "?dryRun=1"}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify(viaPayload ? { ...payload, dryRun: true } : payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const publish = async (payload) => {
  const res = await fetch(`${ORIGIN}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const probeRowCount = async () => {
  const { count } = await svc
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", prof.id)
    .like("title", "__probe_dry_%");
  return count ?? 0;
};

const made = [];
try {
  ok("시작 시 프로브 행 0", (await probeRowCount()) === 0);

  // (1)~(5) 게이트는 dryRun에서도 같은 코드로 답해야 한다 — 검사와 발행의 답이 갈라지면
  // 검사가 오히려 해롭다(통과했다고 믿고 올렸다가 거절당한다).
  const thin = await check({ ...base(1), demoScript: { steps: SCRIPT.steps.slice(0, 2) } });
  ok("부실 대본 → 400 SCRIPT_TOO_THIN", thin.status === 400 && thin.body?.code === "SCRIPT_TOO_THIN", `status ${thin.status} ${thin.body?.code}`);

  const noDevice = await check({ ...base(2), targetDevice: undefined });
  ok("targetDevice 없음 → 400", noDevice.status === 400 && noDevice.body?.code === "TARGET_DEVICE_REQUIRED", `${noDevice.status} ${noDevice.body?.code}`);

  const noAccess = await check({ ...base(3), demoAccess: undefined });
  ok("demoAccess 없음 → 400", noAccess.status === 400 && noAccess.body?.code === "DEMO_ACCESS_REQUIRED", `${noAccess.status} ${noAccess.body?.code}`);

  const onePara = await check({ ...base(4), description: "한 문단으로 쓴 소개글이라 거절돼야 한다" });
  ok("소개글 1줄 → 400 DESCRIPTION_SHAPE", onePara.status === 400 && onePara.body?.code === "DESCRIPTION_SHAPE", `${onePara.status} ${onePara.body?.code}`);

  const vague = await check({ ...base(5), demoScript: { steps: SCRIPT.steps.map((s) => ({ goal: s.goal })) } });
  ok("목차뿐인 대본 → 400 SCRIPT_STEPS_VAGUE", vague.status === 400 && vague.body?.code === "SCRIPT_STEPS_VAGUE", `${vague.status} ${vague.body?.code}`);

  // (6)~(10) 정상 payload — 발행했을 때와 같은 에코를 주지만 행은 만들지 않는다.
  const good = await check(base(6));
  ok("정상 payload → 200", good.status === 200, `status ${good.status} ${JSON.stringify(good.body).slice(0, 140)}`);
  ok("dryRun:true로 답한다", good.body?.dryRun === true, JSON.stringify(good.body?.dryRun));
  ok("accepted 에코가 온다", good.body?.accepted?.title === "__probe_dry_6__" && good.body?.accepted?.targetDevice === "desktop",
    JSON.stringify(good.body?.accepted).slice(0, 140));
  ok("예상 필름 길이가 실린다", (good.body?.accepted?.scriptReview?.film?.seconds ?? 0) > 0,
    JSON.stringify(good.body?.accepted?.scriptReview?.film));
  ok("새 URL이면 wouldUpdate=false", good.body?.wouldUpdate === false, JSON.stringify(good.body?.wouldUpdate));
  ok("발행이 아니다(projectId·reviewUrl 없음)", !good.body?.projectId && !good.body?.reviewUrl, JSON.stringify(Object.keys(good.body)));

  // (11) 게이트를 통과한 검사도 행을 만들지 않는다 — 이게 이 기능의 유일한 약속이다.
  ok("검사 6회 뒤에도 프로브 행 0", (await probeRowCount()) === 0);

  // (12)(13) 파일 업로드 예정 선언은 아티팩트로 인정하되, 서명 URL은 발급하지 않는다.
  const bundleOnly = await check({ ...base(7), deployUrl: undefined, uploads: ["bundle"] });
  ok("URL 없이 uploads:[bundle] → 200", bundleOnly.status === 200 && bundleOnly.body?.dryRun === true, `status ${bundleOnly.status} ${bundleOnly.body?.code ?? ""}`);
  ok("서명 URL·finalizeUrl은 안 준다", !bundleOnly.body?.uploads && !bundleOnly.body?.finalizeUrl, JSON.stringify(Object.keys(bundleOnly.body)));

  // (14) 같은 URL의 초안이 이미 있으면 "덮어쓴다"고 미리 말해야 한다(NF-16의 불만).
  const SHARED_URL = `https://example.com/probe-dry-${STAMP}-shared`;
  const real = await publish({ ...base(8), deployUrl: SHARED_URL });
  if (real.body?.projectId) made.push(real.body.projectId);
  ok("실제 발행 1회 성공(비교 대상 만들기)", real.status === 200 && !!real.body?.projectId, `status ${real.status}`);
  const overwrite = await check({ ...base(9), deployUrl: SHARED_URL });
  ok(
    "같은 URL → wouldUpdate=true + 그 초안 id",
    overwrite.status === 200 && overwrite.body?.wouldUpdate === true && overwrite.body?.draftId === real.body?.projectId,
    JSON.stringify({ wouldUpdate: overwrite.body?.wouldUpdate, draftId: overwrite.body?.draftId }),
  );

  // (15) 공개된 행은 draftId로도 못 건드린다 — 검사도 같은 판정(409)이어야 한다.
  if (real.body?.projectId) {
    await svc.from("projects").update({ is_draft: false }).eq("id", real.body.projectId);
    const published = await check({ ...base(10), draftId: real.body.projectId });
    ok("공개된 행 draftId → 409 NOT_DRAFT", published.status === 409 && published.body?.code === "NOT_DRAFT", `${published.status} ${published.body?.code}`);
    await svc.from("projects").update({ is_draft: true }).eq("id", real.body.projectId);
  } else {
    ok("공개된 행 draftId → 409 NOT_DRAFT", false, "비교 대상 발행 실패");
  }

  // (16) 쿼리를 못 쓰는 호출자를 위해 payload.dryRun도 받는다(발행 버킷 1회를 쓰되 저장은 안 함).
  const viaPayload = await check(base(11), { viaPayload: true });
  ok("payload.dryRun=true도 검사로 처리", viaPayload.status === 200 && viaPayload.body?.dryRun === true, `status ${viaPayload.status}`);
  ok("payload 경로도 행을 안 만든다", (await probeRowCount()) === 1, "발행으로 만든 1건만 남아야 함");
} finally {
  for (const pid of made) {
    const { data } = await svc.storage.from("project-files").list(`${prof.id}/${pid}`, { limit: 100 });
    const keys = (data ?? []).filter((f) => f.id).map((f) => `${prof.id}/${pid}/${f.name}`);
    if (keys.length) await svc.storage.from("project-files").remove(keys);
    await svc.from("projects").delete().eq("id", pid);
  }
  await svc.from("projects").delete().eq("user_id", prof.id).like("title", "__probe_dry_%");
  await svc.from("api_tokens").delete().eq("id", tok.id);
  console.log(`\n정리 완료: 프로젝트 ${made.length}건 · 토큰 1건`);
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
