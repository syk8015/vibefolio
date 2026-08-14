import { getToken, getOrigin } from "./config.js";

// CLI와 MCP가 공유하는 초안 관리 코어(요청4). 서버가 is_draft=true 행만 다루게
// 강제하므로 여기서 지울 수 있는 건 "아직 공개 안 한 초안"뿐이다. URL·파일 교체는
// update로 안 되고, 같은 URL로 publish를 다시 실행하면 초안이 갱신된다(upsert).

async function api(method, path, { token, origin, body } = {}) {
  if (!token) {
    throw new Error(
      "토큰이 없어요. nookframe.com/dashboard → 연결 탭에서 발급 후 `NOOKFRAME_TOKEN` 환경변수에 넣거나 `npx nookframe login <token>` 하세요.",
    );
  }
  const res = await fetch(`${origin.replace(/\/$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (HTTP ${res.status})`);
  return data;
}

export function listDrafts({ token, origin }) {
  return api("GET", "/api/ingest/drafts", { token, origin });
}

export function updateDraft(id, payload, { token, origin }) {
  return api("PATCH", `/api/ingest/drafts/${encodeURIComponent(id)}`, { token, origin, body: payload });
}

export function deleteDraft(id, { token, origin }) {
  return api("DELETE", `/api/ingest/drafts/${encodeURIComponent(id)}`, { token, origin });
}

// `nookframe drafts [list|update|delete]` CLI 명령.
export async function draftsCommand(args) {
  const token = getToken();
  const origin = args.origin || getOrigin();
  const sub = args._[0] || "list";

  if (sub === "list") {
    const { drafts } = await listDrafts({ token, origin });
    if (!drafts?.length) {
      console.log("초안이 없어요. `npx nookframe publish` 로 올려보세요.");
      return;
    }
    for (const d of drafts) {
      console.log(`${d.id}  ${d.title}${d.demo_url ? `  ${d.demo_url}` : ""}`);
    }
    console.log(`\n${drafts.length}개. 수정: drafts update <id> --title … · 삭제: drafts delete <id>`);
    return;
  }

  const id = args._[1];
  if (!id) throw new Error(`사용법: nookframe drafts ${sub} <id>  (id는 drafts list 로 확인)`);

  if (sub === "delete") {
    await deleteDraft(id, { token, origin });
    console.log("✓ 초안을 삭제했어요 (스토리지 파일 포함).");
    return;
  }

  if (sub === "update") {
    let payload = {};
    if (args.json) {
      try {
        payload = JSON.parse(args.json);
      } catch {
        throw new Error("--json 값을 JSON으로 읽을 수 없어요.");
      }
    }
    if (args.title) payload.title = args.title;
    if (args.description) payload.description = args.description;
    if (args.note) payload.builderNote = args.note;
    if (args.hint) payload.demoHighlights = args.hint;
    if (!Object.keys(payload).length) {
      throw new Error("수정할 항목이 없어요 — --title/--description/--note/--hint 또는 --json 을 주세요.");
    }
    const body = await updateDraft(id, payload, { token, origin });
    console.log(`✓ 초안을 수정했어요. 확인: ${body.reviewUrl}`);
    return;
  }

  throw new Error(`알 수 없는 하위 명령: drafts ${sub} (list·update·delete 중 하나)`);
}
