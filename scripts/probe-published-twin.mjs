// 이미 공개된 같은 작품(NF-19, 2026-10-02) prod E2E — 실제 nookframe.com API를 PAT로 때린다.
//
// 왜: AI의 drafts 목록엔 공개된 작품이 안 보여, 이미 공개된 스킨로그를 다시 올려 명함에 두 장이 떴다.
// 이제 새 초안을 만들 차례에 같은 주소·같은 제목의 공개 작품이 있으면 409 PUBLISHED_TWIN.
//
// 검증(전부 dryRun — 행을 만들지 않고, 명함에 아무것도 안 뜬다): 주인(vivestarter)의 **실제 공개
// 작품** 하나를 골라 (1) 같은 제목 → 409 + 메시지에 그 id·newDraft (2) 다른 언어 판 제목만 같아도 409
// (3) newDraft:true면 통과 (4) 처음 보는 제목 → 200 (5) 외부 주소 작품이면 같은 주소 + 다른 제목도 409.
//
// 사용: 레포 루트에서 `node scripts/probe-published-twin.mjs`
// 주의: 시도 버킷(ingest-attempt 60/h)·검사 버킷(ingest-check 60/h)을 몇 번 쓴다. 공개 작품이 없으면 건너뛴다.
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

const { data: prof } = await svc.from("profiles").select("id").eq("username", "vivestarter").maybeSingle();
if (!prof) {
  console.error("프로브 소유자(vivestarter) 프로필을 못 찾았어요.");
  process.exit(1);
}
const { data: pubs } = await svc.from("projects")
  .select("id, title, demo_url, translations").eq("user_id", prof.id).eq("is_draft", false);
if (!pubs?.length) {
  console.log("공개 작품이 없어 건너뜀(쌍둥이를 만들 대상이 없다).");
  process.exit(0);
}
const target = pubs[0];
const otherTitle = Object.values(target.translations ?? {}).map((v) => v?.title).find((t) => typeof t === "string" && t.trim());
const external = pubs.find((p) => /^https?:\/\//i.test(p.demo_url ?? ""));

const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc.from("api_tokens").insert({
  user_id: prof.id,
  token_hash: createHash("sha256").update(raw).digest("hex"),
  token_prefix: `${raw.slice(0, 14)}…`,
  name: "__probe_twin_delete_me__",
}).select("id").single();

const STAMP = Date.now();
const dry = async (extra) => {
  const res = await fetch(`${ORIGIN}/api/ingest?dryRun=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `__probe_twin_${STAMP}__`,
      description: "프로브가 만든 검사용 글\n저장되지 않아요",
      deployUrl: `https://example.com/probe-twin-${STAMP}`,
      demoScript: { steps: [
        { goal: "첫 화면", selector: "#a", action: "click", expect: "열린다" },
        { goal: "두 번째", selector: "#b", action: "click", expect: "반응한다" },
        { goal: "결과", selector: "#c", action: "focus", expect: "결과가 보인다" },
        { goal: "되돌아오기", selector: "#d", action: "click", expect: "첫 화면으로 돌아온다" },
      ] },
      demoAccess: { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" },
      targetDevice: "desktop",
      language: "ko", appLanguages: ["ko", "en"],
      translation: { title: `Probe twin ${STAMP}`, description: "A probe check\nNothing is saved" },
      ownerInterview: { proudMoment: "프로브 자랑 장면", howIUse: "프로브 확인용", mustSee: "프로브 확인 문구" },
      ...extra,
    }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

try {
  const before = (await svc.from("projects").select("id", { count: "exact", head: true }).eq("user_id", prof.id)).count;

  const same = await dry({ title: target.title });
  ok(`같은 제목(「${target.title}」) → 409 PUBLISHED_TWIN`, same.status === 409 && same.body?.code === "PUBLISHED_TWIN", `${same.status} ${same.body?.code}`);
  ok("메시지에 그 작품 id·newDraft·rerecord", ["id " + target.id, "newDraft", "rerecord"].every((k) => (same.body?.error ?? "").includes(k)), (same.body?.error ?? "").slice(0, 160));

  if (otherTitle) {
    const tr = await dry({ translation: { title: otherTitle.toUpperCase(), description: "A probe check\nNothing is saved" } });
    ok(`다른 언어 판 제목(「${otherTitle}」, 대문자로) → 409`, tr.status === 409 && tr.body?.code === "PUBLISHED_TWIN", `${tr.status} ${tr.body?.code}`);
  }

  const ack = await dry({ title: target.title, newDraft: true });
  ok("newDraft:true면 통과(200 dryRun)", ack.status === 200 && ack.body?.dryRun === true, `${ack.status} ${ack.body?.code ?? ""}`);

  const fresh = await dry({});
  ok("처음 보는 제목·주소 → 200", fresh.status === 200 && fresh.body?.dryRun === true, `${fresh.status} ${fresh.body?.code ?? ""}`);

  if (external) {
    const url = await dry({ deployUrl: external.demo_url });
    ok("같은 외부 주소 + 다른 제목 → 409", url.status === 409 && url.body?.code === "PUBLISHED_TWIN" && (url.body?.error ?? "").includes("entry URL"), `${url.status} ${url.body?.code}`);
  } else {
    console.log("· 외부 주소로 공개된 작품이 없어 주소 판정은 단위 프로브(probe-published-twin-unit)로만 본다");
  }

  const after = (await svc.from("projects").select("id", { count: "exact", head: true }).eq("user_id", prof.id)).count;
  ok("행이 하나도 안 생겼다", before === after, `${before} → ${after}`);
} finally {
  await svc.from("api_tokens").delete().eq("id", tok.id);
  console.log("\n정리 완료: 토큰 1건");
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
