// 원격 MCP 툴 표시(2026-10-02) prod E2E — 실서버 /api/mcp의 tools/list를 PAT로 받아 본다.
//
// 검증(읽기만 — 툴을 부르지 않는다):
//   (1) 옛 규격(initialize 뒤 tools/list)과 신규격(_meta 판 표시) 둘 다 툴 7개를 준다.
//   (2) 툴마다 title이 있고, readOnlyHint나 destructiveHint 중 하나가 true다(커넥터 디렉터리 요건).
//   (3) 읽기 3개는 readOnlyHint, 초안을 바꾸는 4개는 destructiveHint — 뒤바뀌면 Claude가
//       삭제를 확인 없이 돌리거나 조회마다 묻는다.
//
// 사용: 레포 루트에서 `npx -y tsx scripts/probe-mcp-annotations.mts`
// 서비스롤 키는 키체인에서 온다 — scripts/_secrets.mjs. 심은 토큰은 끝에 지운다.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

const ORIGIN = process.env.PROBE_ORIGIN ?? "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail.slice(0, 220)}` : ""}`);
  if (!pass) failed++;
};

const READ = ["check_nookframe_payload", "get_nookframe_status", "list_nookframe_drafts"];
const WRITE = ["publish_to_nookframe", "rerecord_nookframe_demo", "update_nookframe_draft", "delete_nookframe_draft"];

type Tool = { name: string; title?: string; annotations?: Record<string, unknown> };

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
  name: "__probe_mcp_annotations_delete_me__",
}).select("id").single();

const rpc = async (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const r = await fetch(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json().catch(() => ({}))) as { result?: { tools?: Tool[] } } };
};

const checkTools = (label: string, tools: Tool[] | undefined) => {
  ok(`${label}: 툴 7개`, tools?.length === 7, `${tools?.length}`);
  for (const t of tools ?? []) {
    const a = t.annotations ?? {};
    const titled = typeof t.title === "string" && t.title.trim().length > 0 && a.title === t.title;
    const hinted = a.readOnlyHint === true || a.destructiveHint === true;
    const right = READ.includes(t.name)
      ? a.readOnlyHint === true && a.destructiveHint === false
      : WRITE.includes(t.name) && a.readOnlyHint === false && a.destructiveHint === true;
    ok(`${label}: ${t.name}`, titled && hinted && right && t.name.length <= 64, `"${t.title}" ${JSON.stringify(a)}`);
  }
};

try {
  // (1) 옛 규격 — 연결 인사 뒤 목록
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "1" } } });
  ok("옛 규격 initialize 200", init.status === 200, `${init.status}`);
  const oldList = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, { "MCP-Protocol-Version": "2025-06-18" });
  checkTools("옛 규격", oldList.json.result?.tools);

  // 신규격 — 본문이 판을 밝힌다
  const V = "2026-07-28";
  const newList = await rpc(
    { jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: { "io.modelcontextprotocol/protocolVersion": V } } },
    { "MCP-Protocol-Version": V, "Mcp-Method": "tools/list" },
  );
  checkTools("신규격", newList.json.result?.tools);
} finally {
  await svc.from("api_tokens").delete().eq("id", tok!.id);
  console.log("\n정리 완료: 토큰 1건");
}

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
