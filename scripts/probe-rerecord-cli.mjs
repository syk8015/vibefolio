// 재촬영 — CLI·MCP 경로 prod E2E (2026-08-26).
//
// 재촬영 루프의 사람 쪽 절반(불만 적기 → 프롬프트 복사)은 08-25에 붙었고, AI 쪽
// 제출은 curl뿐이었다. 이 프로브는 새로 붙인 두 입구가 **같은 대기 상태**에
// 도달하는지 실서버로 확인한다.
//   (1) CLI  `nookframe rerecord <id> --json '{"demoScript":…,"note":…}'`
//   (2) CLI  대본만 준 형태 `{"steps":[…]}` + --note 플래그
//   (3) CLI  --file <path>
//   (4) MCP  stdio 서버를 실제로 띄워 tools/list에 rerecord_nookframe_demo가 있고
//            tools/call이 대기 대본을 남기는지 (SDK 실물 왕복)
//   (5) 게이트: 2스텝이면 거절(SCRIPT_TOO_THIN) · 남의 프로젝트면 403
//   (6) 공개 데이터 불변: demo_script는 그대로, pending_*만 바뀐다
// 끝나면 throwaway 프로젝트·토큰 정리.
//
// 사용: node scripts/probe-rerecord-cli.mjs
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.loadEnvFile(".env.local");
const ORIGIN = process.env.NOOKFRAME_ORIGIN || "https://nookframe.com";
const CLI = "cli/bin/nookframe.js";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// jsonb는 객체 키 순서를 보존하지 않는다 — JSON.stringify 비교는 그것만으로 깨진다
// (demo_access 프로브의 선례). 값이 같은지 순서와 무관하게 본다.
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
};

const script = (n, tag) => ({
  steps: Array.from({ length: n }, (_, i) => ({
    goal: `${tag} 스텝 ${i + 1}`,
    selector: `#step-${i + 1}`,
    action: "click",
  })),
});

const ORIGINAL = script(4, "원본");

// "첫 번째 프로필"이 아니라 관리자 계정으로 못 박는다 — 계정이 늘거나 사라지면
// 대상이 조용히 바뀐다(08-26 계정 정리 때 실제로 바뀔 뻔했다).
const OWNER_EMAIL = process.env.PROBE_OWNER_EMAIL || "vivestarter@gmail.com";
const { data: users } = await svc.auth.admin.listUsers({ perPage: 200 });
const ownerUser = users?.users?.find((u) => u.email === OWNER_EMAIL);
const { data: prof } = ownerUser
  ? await svc.from("profiles").select("id").eq("id", ownerUser.id).maybeSingle()
  : { data: null };
if (!prof) {
  console.error(`${OWNER_EMAIL}의 프로필을 찾지 못했어요 — 프로브를 돌릴 소유자가 필요합니다.`);
  process.exit(1);
}
const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc
  .from("api_tokens")
  .insert({
    user_id: prof.id,
    token_hash: createHash("sha256").update(raw).digest("hex"),
    token_prefix: `${raw.slice(0, 14)}…`,
    name: "__probe_rerec_delete_me__",
  })
  .select("id")
  .single();

// 재촬영은 **공개된** 작품에 쓰는 기능이라 is_draft=false 행이 필요하다.
const projectId = randomUUID();
const { error: insErr } = await svc.from("projects").insert({
  id: projectId,
  user_id: prof.id,
  title: "__probe_rerec__",
  description: "재촬영 CLI 프로브",
  demo_url: "https://example.com/",
  demo_script: ORIGINAL,
  is_draft: false,
});
if (insErr) {
  console.error(`프로젝트 생성 실패: ${insErr.message}`);
  process.exit(1);
}

const S = mkdtempSync(join(tmpdir(), "nf-probe-rerec-"));
const env = { ...process.env, NOOKFRAME_TOKEN: raw, NOOKFRAME_ORIGIN: ORIGIN };
const runCli = (args) => {
  try {
    return { code: 0, out: execFileSync("node", [CLI, ...args], { env, encoding: "utf8" }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
const pending = async () => {
  const { data } = await svc
    .from("projects")
    .select("demo_script, pending_demo_script, pending_script_note")
    .eq("id", projectId)
    .single();
  return data ?? {};
};
const clearPending = () =>
  svc.from("projects").update({ pending_demo_script: null, pending_script_note: null }).eq("id", projectId);

// MCP stdio 서버와 한 번 왕복 — JSON-RPC를 직접 말한다(호스트 흉내).
function mcpCall(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [CLI, "mcp"], { env, stdio: ["pipe", "pipe", "pipe"] });
    const seen = [];
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP 응답 시간 초과 (받은 응답 ${seen.length}개)`));
    }, 60_000);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          seen.push(JSON.parse(line));
        } catch {
          /* 서버 로그 줄 — 무시 */
        }
        if (seen.length >= requests.length) {
          clearTimeout(timer);
          child.kill();
          resolve(seen);
        }
      }
    });
    child.on("error", reject);
    for (const r of requests) child.stdin.write(`${JSON.stringify(r)}\n`);
  });
}

try {
  // (1) 봉투 형태
  const r1 = runCli([
    "rerecord",
    projectId,
    "--json",
    JSON.stringify({ demoScript: script(3, "봉투"), note: "16초 클릭 제거" }),
  ]);
  ok("(1) CLI 봉투 형태 성공", r1.code === 0 && /3스텝 대기/.test(r1.out), r1.out.trim().slice(0, 160));
  const p1 = await pending();
  ok("(1) pending 대본 3스텝", p1.pending_demo_script?.steps?.length === 3, JSON.stringify(p1.pending_demo_script)?.slice(0, 80));
  ok("(1) note 저장", p1.pending_script_note === "16초 클릭 제거", p1.pending_script_note);
  ok("(6) 공개 대본은 그대로", deepEqual(p1.demo_script, ORIGINAL), JSON.stringify(p1.demo_script)?.slice(0, 120));
  await clearPending();

  // (2) 대본만 + --note
  const r2 = runCli(["rerecord", projectId, "--json", JSON.stringify(script(5, "생대본")), "--note", "스텝 5개로"]);
  ok("(2) CLI 대본만 준 형태 성공", r2.code === 0 && /5스텝 대기/.test(r2.out), r2.out.trim().slice(0, 160));
  const p2 = await pending();
  ok("(2) pending 5스텝 + note", p2.pending_demo_script?.steps?.length === 5 && p2.pending_script_note === "스텝 5개로");
  await clearPending();

  // (3) --file
  const f = join(S, "shot.json");
  writeFileSync(f, JSON.stringify({ demoScript: script(4, "파일"), note: "파일 경로" }));
  const r3 = runCli(["rerecord", projectId, "--file", f]);
  ok("(3) CLI --file 성공", r3.code === 0 && /4스텝 대기/.test(r3.out), r3.out.trim().slice(0, 160));
  await clearPending();

  // (4) MCP 실물 왕복
  const [, listRes, callRes] = await mcpCall([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "0" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "rerecord_nookframe_demo", arguments: { id: projectId, demoScript: script(6, "MCP"), note: "MCP로 제출" } },
    },
  ]);
  const names = (listRes?.result?.tools ?? []).map((t) => t.name);
  ok("(4) tools/list에 rerecord_nookframe_demo", names.includes("rerecord_nookframe_demo"), names.join(","));
  ok("(4) 기존 툴 4종 그대로", ["publish_to_nookframe", "list_nookframe_drafts", "update_nookframe_draft", "delete_nookframe_draft"].every((n) => names.includes(n)), names.join(","));
  const callText = callRes?.result?.content?.[0]?.text ?? "";
  ok("(4) tools/call 성공 + 대기 안내", /6스텝 대기/.test(callText) && !callRes?.result?.isError, callText.slice(0, 160));
  const p4 = await pending();
  ok("(4) MCP 제출이 pending에 도달", p4.pending_demo_script?.steps?.length === 6, JSON.stringify(p4.pending_demo_script)?.slice(0, 80));
  await clearPending();

  // (5) 게이트
  const thin = runCli(["rerecord", projectId, "--json", JSON.stringify(script(2, "얇음"))]);
  ok("(5) 2스텝은 거절", thin.code !== 0, thin.out.trim().slice(0, 160));
  const p5 = await pending();
  ok("(5) 거절이면 pending 안 남음", !p5.pending_demo_script, JSON.stringify(p5.pending_demo_script)?.slice(0, 60));

  const foreign = runCli(["rerecord", randomUUID(), "--json", JSON.stringify(script(3, "남의것"))]);
  ok("(5) 없는 프로젝트는 실패", foreign.code !== 0, foreign.out.trim().slice(0, 120));

  const noScript = runCli(["rerecord", projectId, "--json", JSON.stringify({ note: "대본 없음" })]);
  ok("(5) 대본 없으면 클라가 먼저 거절", noScript.code !== 0 && /대본을 찾지 못했어요/.test(noScript.out), noScript.out.trim().slice(0, 120));
} finally {
  await svc.from("projects").delete().eq("id", projectId);
  await svc.from("projects").delete().like("title", "__probe_rerec%");
  if (tok) await svc.from("api_tokens").delete().eq("id", tok.id);
  console.log("[cleanup] 프로젝트·토큰 삭제 완료");
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
