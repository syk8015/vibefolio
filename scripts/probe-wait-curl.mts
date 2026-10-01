// 대본 '기다리기'(wait) + npm이 막힌 셸의 curl 길(2026-10-02) prod E2E — 실제 nookframe.com API를 PAT로 때린다.
//
// 검증(전부 dryRun — 행을 만들지 않는다):
//   (1) 연결 프롬프트(pastePrompt)에 실린 curl 검사 명령을 **글자 그대로** 셸에서 돌린다 → 200 dryRun.
//       코드→토큰 교환 줄은 돌리지 않는다: 교환은 주인의 prompt-auto 토큰을 폐기하므로(센티널 규칙)
//       진행 중인 AI를 끊을 수 있다 — 교환 자체는 probe-connect-code.mjs가 본다. 여기선 심은 토큰을 쓴다.
//   (2) wait 스텝 대본이 통과하고, 영어 자막이 빠진 wait 스텝은 자막 게이트에 안 걸린다.
//   (3) wait 스텝은 실속으로 안 센다 — 실속 2 + wait 2면 "부실한 대본"으로 400.
//
// 사용: 레포 루트에서 `npx -y tsx scripts/probe-wait-curl.mts`
// 주의: 검사 버킷(ingest-check 60/h)을 3번 쓴다. 서비스롤 키는 키체인에서 온다 — scripts/_secrets.mjs.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pastePrompt } from "../lib/connectSnippets";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail.slice(0, 220)}` : ""}`);
  if (!pass) failed++;
};

const { data: prof } = await svc.from("profiles").select("id").eq("username", "vivestarter").maybeSingle();
if (!prof) {
  console.error("프로브 소유자(vivestarter) 프로필을 못 찾았어요.");
  process.exit(1);
}
const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc.from("api_tokens").insert({
  user_id: prof.id,
  token_hash: createHash("sha256").update(raw).digest("hex"),
  token_prefix: `${raw.slice(0, 14)}…`,
  name: "__probe_wait_delete_me__",
}).select("id").single();

const STAMP = Date.now();
const payload = (steps: unknown[]) => ({
  title: `__probe_wait_${STAMP}__`,
  description: "프로브가 만든 검사용 글\n저장되지 않아요",
  deployUrl: `https://example.com/probe-wait-${STAMP}`,
  demoScript: { steps },
  demoAccess: { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" },
  targetDevice: "desktop",
  language: "ko", appLanguages: ["ko"],
  translation: { title: `Probe wait ${STAMP}`, description: "A probe check\nNothing is saved" },
  ownerInterview: { proudMoment: "프로브 자랑 장면", howIUse: "프로브 확인용", mustSee: "프로브 확인 문구" },
});
const en = (t: string) => ({ en: t });
const GOOD = [
  { goal: "질문 보내기", selector: "#ask", action: "click", expect: "로딩 표시", caption: en("Ask a question") },
  { goal: "답 기다리기", selector: "#answer", action: "wait", hold: 2 }, // 자막 없음 = 면제
  { goal: "답 확대", selector: "#answer", action: "focus", caption: en("The answer, up close") },
  { goal: "다시 묻기", selector: "#retry", action: "click", caption: en("Ask again") },
  { goal: "잠깐 멈춤", action: "wait", hold: 1.5 },
];

const dir = mkdtempSync(join(tmpdir(), "nf-probe-wait-"));
try {
  // (1) 프롬프트의 curl 검사 줄을 그대로 — 토큰 자리·파일 자리만 채운다.
  const prompt = pastePrompt(ORIGIN, "ko", "nf_code_PROBE");
  const m = prompt.match(/curl -X POST "[^"]*\?dryRun=1" \\\n(?:.*\\\n)*?.*--data @<that file>/);
  ok("연결 프롬프트에 curl 검사 명령이 있다", !!m, m?.[0].split("\n")[0] ?? "");
  if (m) {
    const file = join(dir, "payload.json");
    writeFileSync(file, JSON.stringify(payload(GOOD)));
    // 줄 이음(\)을 풀고 자리표시를 채운 뒤 셸이 아니라 인자 배열로 넘긴다(토큰이 명령줄 로그에 안 남게 -H @파일).
    const headerFile = join(dir, "auth.txt");
    writeFileSync(headerFile, `Authorization: Bearer ${raw}\n`);
    const cmd = m[0].replace(/\\\n\s*/g, " ")
      .replace('-H "Authorization: Bearer <the token it just printed>"', `-H @${headerFile}`)
      .replace("<that file>", file);
    const args = (cmd.match(/"[^"]*"|\S+/g) ?? []).slice(1).map((a) => a.replace(/^"|"$/g, ""));
    const out = execFileSync("curl", ["-s", "-w", "\n%{http_code}", ...args], { encoding: "utf8" });
    const [body, code] = [out.slice(0, out.lastIndexOf("\n")), out.slice(out.lastIndexOf("\n") + 1)];
    let parsed: { dryRun?: boolean; code?: string; error?: string } = {};
    try { parsed = JSON.parse(body); } catch { /* 아래에서 짚는다 */ }
    ok("(1·2) 프롬프트의 curl 그대로 + wait 대본 → 200 dryRun(wait 자막 면제)", code === "200" && parsed.dryRun === true, `${code} ${parsed.code ?? ""} ${parsed.error ?? ""}`);
    ok("응답에 예상 길이·대본 요약이 실린다", /wait|script|film/i.test(body), body.slice(0, 200));
  }

  // (3) wait은 실속이 아니다
  const thin = await fetch(`${ORIGIN}/api/ingest?dryRun=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload([
      { goal: "질문", selector: "#ask", action: "click", caption: en("Ask") },
      { goal: "기다림1", selector: "#a", action: "wait" },
      { goal: "확대", selector: "#a", action: "focus", caption: en("Look") },
      { goal: "기다림2", action: "wait" },
    ])),
  });
  const thinBody = await thin.json().catch(() => ({})) as { code?: string };
  ok("(3) 실속 2 + wait 2 → 400(부실한 대본)", thin.status === 400, `${thin.status} ${thinBody.code ?? ""}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
  await svc.from("api_tokens").delete().eq("id", tok!.id);
  console.log("\n정리 완료: 토큰 1건");
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
