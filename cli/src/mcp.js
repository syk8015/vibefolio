import { getToken, getOrigin } from "./config.js";
import { runPublish } from "./publish.js";
import { formatAccepted } from "./echo.js";
import { listDrafts, updateDraft, deleteDraft } from "./drafts.js";
import { submitRerecord, formatRerecord } from "./rerecord.js";
import { runDryRun, declareUploads, formatDryRun } from "./check.js";
// 툴 정의 전부가 생성물에서 온다(2026-09-17). 원본은 레포의 schema/publish.json이고
// `npm run schema:build`가 이 파일이 읽는 schema.js를 만든다 — 예전엔 아래에 손으로
// 적혀 있어서 서버 설명과 갈라질 수 있었다.
import { TOOLS } from "./schema.js";

// `nookframe mcp` — MCP stdio 서버. 클로드 데스크탑·커서 등 MCP 호스트가
// `npx -y nookframe mcp` 로 띄우고, 그 안의 AI가 publish_to_nookframe 툴을 호출한다.
// SDK는 optionalDependency라 동적 import — 없으면 친절히 안내.
// 발행 payload의 필드·규칙 설명은 schema.js 한 곳 — `nookframe schema`와 같은 출처다.
export async function runMcp() {
  let Server, StdioServerTransport, ListToolsRequestSchema, CallToolRequestSchema;
  try {
    ({ Server } = await import("@modelcontextprotocol/sdk/server/index.js"));
    ({ StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js"));
    ({ ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js"));
  } catch {
    console.error(
      "Could not load the MCP SDK. Install it with `npm i @modelcontextprotocol/sdk`, or run `npx -y nookframe mcp` instead.",
    );
    process.exit(1);
    return;
  }

  const server = new Server(
    { name: "nookframe", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const a = req.params.arguments || {};
    const conn = { token: getToken(), origin: getOrigin() };
    try {
      switch (req.params.name) {
        case "publish_to_nookframe": {
          const { dir, screenshot, video, ...payload } = a;
          const body = await runPublish({
            payload,
            dir: dir || null,
            screenshotPath: screenshot || null,
            videoPath: video || null,
            ...conn,
          });
          const verb = payload.draftId ? "Updated the draft" : body.upserted ? "Updated the existing draft" : "Uploaded as a draft";
          // 저장 에코를 툴 결과에 실어야 호출한 AI가 자기 payload가 어디까지
          // 살아남았는지(태그 철자·분류·500자 절단) 스스로 확인하고 고칠 수 있다.
          // 초안 id도 싣는다 — 다음 수정에 draftId로 넘겨야 파일 업로드 초안이 중복되지 않는다.
          const echo = formatAccepted(body.accepted);
          return { content: [{ type: "text", text:
            `${verb} on Nookframe (draft id: ${body.projectId} — pass it as draftId to update this draft). Review and publish: ${body.reviewUrl}${echo.length ? `\n${echo.join("\n")}` : ""}` }] };
        }
        case "check_nookframe_payload": {
          const { dir, screenshot, video, ...payload } = a;
          // 파일은 올리지 않지만 "올릴 예정"이라는 선언은 실어야 발행과 같은 답이 나온다.
          const uploads = declareUploads(payload, { dir, screenshot, video });
          const { status, body } = await runDryRun({ payload, ...conn });
          if (status !== 200 || !body?.ok) {
            return { isError: true, content: [{ type: "text", text:
              `This payload would be REJECTED (${body?.code ?? `HTTP ${status}`}): ${body?.error ?? "the server sent no message"}\nNothing was uploaded — fix the payload and check again.` }] };
          }
          if (!body.dryRun) {
            return { isError: true, content: [{ type: "text", text:
              `This Nookframe server does not support checking yet, so the payload was PUBLISHED as a draft (id ${body.projectId ?? "unknown"}). Tell the owner, or delete it with delete_nookframe_draft.` }] };
          }
          return { content: [{ type: "text", text: formatDryRun(body, uploads).join("\n") }] };
        }
        case "list_nookframe_drafts": {
          const { drafts } = await listDrafts(conn);
          if (!drafts?.length) return { content: [{ type: "text", text: "No drafts." }] };
          const lines = drafts.map((d) => `- ${d.id} · ${d.title}${d.demo_url ? ` · ${d.demo_url}` : ""}`
            + ` · [${d.tags?.length ? d.tags.join(", ") : "no AI tools"} / ${d.content_type || "no type"} / ${d.target_device || "screen not answered"}]`);
          return { content: [{ type: "text", text: `${drafts.length} draft(s):\n${lines.join("\n")}` }] };
        }
        case "update_nookframe_draft": {
          const { id, ...payload } = a;
          const body = await updateDraft(id, payload, conn);
          const echo2 = formatAccepted(body.accepted);
          return { content: [{ type: "text", text:
            `Draft updated. Review: ${body.reviewUrl}${echo2.length ? `\n${echo2.join("\n")}` : ""}` }] };
        }
        case "rerecord_nookframe_demo": {
          const { id, ...body } = a;
          const res = await submitRerecord(id, body, conn);
          return { content: [{ type: "text", text: formatRerecord(res).join("\n") }] };
        }
        case "delete_nookframe_draft": {
          await deleteDraft(a.id, conn);
          return { content: [{ type: "text", text: "Draft deleted (uploaded files included)." }] };
        }
        default:
          return { isError: true, content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }] };
      }
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  });

  await server.connect(new StdioServerTransport());
  // stdio 서버는 연결 후 표준입출력으로 계속 통신 — 프로세스가 종료되지 않게 유지된다.
}
