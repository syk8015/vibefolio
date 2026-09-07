import { getToken, getOrigin } from "./config.js";
import { formatAccepted } from "./echo.js";
import { api } from "./api.js";

// CLI와 MCP가 공유하는 초안 관리 코어(요청4). 서버가 is_draft=true 행만 다루게
// 강제하므로 여기서 지울 수 있는 건 "아직 공개 안 한 초안"뿐이다. URL·파일 교체는
// update로 안 되고, 같은 URL로 publish를 다시 실행하면 초안이 갱신된다(upsert).

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
      console.log("No drafts yet. Upload one with `npx nookframe publish`.");
      return;
    }
    for (const d of drafts) {
      console.log(`${d.id}  ${d.title}${d.demo_url ? `  ${d.demo_url}` : ""}`);
      // 발행 때 조용히 버려지는 값들(AI 툴·분류)을 나중에도 확인할 수 있게 같이 출력.
      const meta = [
        d.tags?.length ? d.tags.join(", ") : "no AI tools",
        d.content_type || "no type",
        d.demo_user_hint ? "has demo highlights" : "no demo highlights",
      ];
      console.log(`    ${meta.join(" · ")}`);
    }
    console.log(`\n${drafts.length} draft(s). Edit: drafts update <id> --title … · Delete: drafts delete <id>`);
    return;
  }

  const id = args._[1];
  if (!id) throw new Error(`Usage: nookframe drafts ${sub} <id>  (find the id with drafts list)`);

  if (sub === "delete") {
    await deleteDraft(id, { token, origin });
    console.log("✓ Draft deleted (uploaded files included).");
    return;
  }

  if (sub === "update") {
    let payload = {};
    if (args.json) {
      try {
        payload = JSON.parse(args.json);
      } catch {
        throw new Error("Could not parse the --json value as JSON.");
      }
    }
    if (args.title) payload.title = args.title;
    if (args.description) payload.description = args.description;
    if (args.note) payload.builderNote = args.note;
    if (args.hint) payload.demoHighlights = args.hint;
    if (!Object.keys(payload).length) {
      throw new Error("Nothing to change — pass --title/--description/--note/--hint or --json.");
    }
    const body = await updateDraft(id, payload, { token, origin });
    console.log("✓ Draft updated.");
    for (const line of formatAccepted(body.accepted)) console.log(line);
    console.log(`\n  Review: ${body.reviewUrl}`);
    return;
  }

  throw new Error(`Unknown subcommand: drafts ${sub} (expected list, update or delete)`);
}
