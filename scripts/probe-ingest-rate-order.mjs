// 인제스트 발행 한도의 순서(2026-09-22, 출시 점검 R5) prod E2E.
//
// 왜 만들었나: 발행 버킷(ingest 20/h)이 본문 검사보다 먼저 돌아서, 게이트에 거절된 요청도
// 한 번씩 셌다. 게이트는 "AI가 사유를 보고 고쳐서 다시 보낸다"는 설계라, check를 안 쓰는
// AI가 몇 번 고치다 한 시간을 통째로 막혔다. 이제 거절은 느슨한 시도 버킷(ingest-attempt
// 60/h)만 쓰고, 발행 버킷은 게이트를 다 통과한 뒤에만 센다. finalize는 자기 버킷을 쓴다.
//
// 검증: (1) 대본 없는 요청 → 400 SCRIPT_REQUIRED (2) targetDevice "tablet" → 400
// TARGET_DEVICE_INVALID(받은 값을 말한다) (3) 빠진 targetDevice → 여전히 TARGET_DEVICE_REQUIRED
// (4) 이 거절들이 발행 버킷(`ingest:<uid>`)을 한 칸도 안 쓴다 (5) 시도 버킷은 센다.
//
// 사용: 레포 루트에서 `node scripts/probe-ingest-rate-order.mjs`
// 발행 버킷은 쓰지 않는다(행도 안 만든다). 시도 버킷 3칸을 쓴다.
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
    name: "__probe_rate_order_delete_me__",
  })
  .select("id")
  .single();

/** 버킷의 현재 칸 수. 창이 지났으면 0으로 본다(다음 호출이 새 창을 연다). */
const bucketCount = async (name) => {
  const { data } = await svc.from("rate_limits").select("count, window_start").eq("bucket", `${name}:${prof.id}`).maybeSingle();
  if (!data) return 0;
  return Date.now() - new Date(data.window_start).getTime() > 3600_000 ? 0 : data.count;
};

const SCRIPT = {
  steps: [
    { goal: "첫 화면", selector: "#a", action: "click", expect: "열린다" },
    { goal: "입력", selector: "#b", action: "type", text: "hello", expect: "글자가 보인다" },
    { goal: "결과", selector: "#c", action: "focus", expect: "결과가 보인다" },
    { goal: "되돌아오기", selector: "#d", action: "click", expect: "첫 화면" },
  ],
};
const base = {
  title: "__probe_rate_order__",
  description: "프로브가 보낸 거절용 요청\n저장되지 않아요",
  deployUrl: `https://example.com/probe-rate-${Date.now()}`,
  demoScript: SCRIPT,
  demoAccess: { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" },
};
const send = async (payload) => {
  const res = await fetch(`${ORIGIN}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

try {
  const publishBefore = await bucketCount("ingest");
  const attemptBefore = await bucketCount("ingest-attempt");

  const noScript = await send({ ...base, demoScript: undefined, targetDevice: "desktop" });
  ok("대본 없음 → 400 SCRIPT_REQUIRED", noScript.status === 400 && noScript.body?.code === "SCRIPT_REQUIRED", `${noScript.status} ${noScript.body?.code}`);

  const tablet = await send({ ...base, targetDevice: "tablet" });
  ok(
    "targetDevice \"tablet\" → 400 TARGET_DEVICE_INVALID + 받은 값을 말한다",
    tablet.status === 400 && tablet.body?.code === "TARGET_DEVICE_INVALID" && String(tablet.body?.error ?? "").includes("tablet"),
    `${tablet.status} ${tablet.body?.code} ${tablet.body?.error ?? ""}`,
  );

  const missing = await send({ ...base });
  ok("targetDevice 없음 → 400 TARGET_DEVICE_REQUIRED", missing.status === 400 && missing.body?.code === "TARGET_DEVICE_REQUIRED", `${missing.status} ${missing.body?.code}`);

  const publishAfter = await bucketCount("ingest");
  const attemptAfter = await bucketCount("ingest-attempt");
  ok("게이트 거절은 발행 버킷(ingest 20/h)을 안 쓴다", publishAfter === publishBefore, `${publishBefore} → ${publishAfter}`);
  ok("게이트 거절은 시도 버킷(ingest-attempt 60/h)에 센다", attemptAfter >= attemptBefore + 3 || attemptAfter === 3, `${attemptBefore} → ${attemptAfter}`);
} finally {
  await svc.from("projects").delete().eq("user_id", prof.id).eq("title", "__probe_rate_order__");
  await svc.from("api_tokens").delete().eq("id", tok.id);
  console.log("\n정리 완료: 토큰 1건");
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
