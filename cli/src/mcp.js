import { getToken, getOrigin } from "./config.js";
import { runPublish } from "./publish.js";

// `nookframe mcp` — MCP stdio 서버. 클로드 데스크탑·커서 등 MCP 호스트가
// `npx -y nookframe mcp` 로 띄우고, 그 안의 AI가 publish_to_nookframe 툴을 호출한다.
// SDK는 optionalDependency라 동적 import — 없으면 친절히 안내.
export async function runMcp() {
  let Server, StdioServerTransport, ListToolsRequestSchema, CallToolRequestSchema;
  try {
    ({ Server } = await import("@modelcontextprotocol/sdk/server/index.js"));
    ({ StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js"));
    ({ ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js"));
  } catch {
    console.error(
      "MCP SDK를 불러오지 못했어요. `npm i @modelcontextprotocol/sdk` 로 설치하거나 `npx -y nookframe mcp` 로 다시 실행하세요.",
    );
    process.exit(1);
    return;
  }

  const server = new Server(
    { name: "nookframe", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const TOOL = {
    name: "publish_to_nookframe",
    description:
      "이 프로젝트를 Nookframe(바이브코딩 포트폴리오)에 초안으로 올린다. 당신이 이 프로젝트를 만든 AI로서 레포(README·라우트·git log)를 근거로 title/description/demoHighlights를 직접 작성해 전달하라. deployUrl(배포된 공개 URL) 또는 dir(로컬 정적 빌드 폴더 절대경로) 중 하나를 준다. 랜딩과 실제 앱 화면 주소가 다르면 appUrl에 앱 URL을 함께 줘라(시연·임베드는 appUrl을 연다). demoHighlights는 '○○를 클릭' 같은 지시가 아니라 '○○ 기능이 핵심' 처럼 서술형으로.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "짧고 명확한 제품 이름" },
        description: { type: "string", description: "한 문단 설명 (미완성이면 지향점까지)" },
        builderNote: { type: "string", description: "만들려던 의도 등 부가 메모" },
        demoHighlights: { type: "string", description: "시연 영상에서 보여줄 핵심 3~5가지, 서술형, 500자 이내" },
        tags: { type: "array", items: { type: "string" }, description: "이 작업에 쓴 AI 툴들 (예: Claude Code)" },
        contentType: {
          type: "string",
          enum: ["web-app", "saas", "mobile", "game", "extension", "ai-service", "media", "other"],
        },
        deployUrl: { type: "string", description: "배포된 공개 URL" },
        appUrl: { type: "string", description: "실제 앱 화면 URL (랜딩과 다를 때 — 시연·임베드는 이 주소를 연다)" },
        dir: { type: "string", description: "정적 빌드 디렉터리 절대경로 (deployUrl이 없을 때)" },
      },
      required: ["title"],
    },
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL] }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "publish_to_nookframe") {
      return { isError: true, content: [{ type: "text", text: `알 수 없는 툴: ${req.params.name}` }] };
    }
    const a = req.params.arguments || {};
    const { dir, ...payload } = a;
    try {
      const body = await runPublish({
        payload,
        dir: dir || null,
        token: getToken(),
        origin: getOrigin(),
      });
      return { content: [{ type: "text", text: `Nookframe에 초안으로 올렸어요. 확인하고 공개: ${body.reviewUrl}` }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `실패: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  });

  await server.connect(new StdioServerTransport());
  // stdio 서버는 연결 후 표준입출력으로 계속 통신 — 프로세스가 종료되지 않게 유지된다.
}
