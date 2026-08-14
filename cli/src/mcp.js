import { getToken, getOrigin } from "./config.js";
import { runPublish } from "./publish.js";
import { listDrafts, updateDraft, deleteDraft } from "./drafts.js";

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

  // AI_TOOLS 화이트리스트 사본 — lib/projectTaxonomy.ts와 짝. cli/는 독립 배포
  // 패키지라 레포 코드를 import 못 해(AGENTS.md) 하드코딩한다. 서버가 이 철자만
  // 정확히 받고 나머지는 조용히 버리므로, 저 목록이 바뀌면 여기도 같이 고쳐야 한다.
  const AI_TOOL_IDS = [
    "ChatGPT", "Claude Code", "Cursor", "GitHub Copilot", "Gemini", "v0",
    "Bolt.new", "Windsurf", "Lovable", "Replit AI", "Devin", "Aider",
    "Continue.dev", "Codeium", "Amazon Q", "Perplexity", "Midjourney",
    "DALL-E", "Stable Diffusion", "Ideogram", "Flux", "Runway", "Kling",
    "Pika", "Suno", "ElevenLabs",
  ];

  const TOOL = {
    name: "publish_to_nookframe",
    description:
      "이 프로젝트를 Nookframe(바이브코딩 포트폴리오)에 초안으로 올린다. 당신이 이 프로젝트를 만든 AI로서 레포(README·라우트·git log)를 근거로 title/description/demoHighlights를 직접 작성해 전달하라. deployUrl(배포된 공개 URL) 또는 dir(로컬 정적 빌드 폴더 절대경로) 중 하나를 준다. 미배포+서버·DB가 필요해 dir로 안 되면 deployUrl에 공개 GitHub 저장소 URL을 대신 줘도 된다(clone 후 npm run dev를 시도하는 최후 수단 — 비공개 저장소·dev 스크립트 없으면 실패, 원격 DB 앱은 읽기전용 데모). 랜딩과 실제 앱 화면 주소가 다르면 appUrl에 앱 URL을 함께 줘라(시연·임베드는 appUrl을 연다). 로그인해야 화면이 보이는 앱이면 demoAccess에 로그인 없이 들어가는 데모/게스트 진입 정보를 줘라(계정 아이디/비번은 받지 않는다). 게스트 경로 자체가 원천 불가능한 앱(E2E 암호화·기기 페어링 필수 등)이면 demoAccess를 { impossible: true, note: \"이유\" }로 줘라 — 그 경우 자동 촬영은 랜딩만 담으니 video 동봉을 강하게 권장한다. 직접 찍은 스크린샷·시연 영상 파일이 있으면 screenshot/video에 절대경로로 줘라(영상을 주면 자동 촬영은 생략된다). demoHighlights는 '○○를 클릭' 같은 지시가 아니라 '○○ 기능이 핵심' 처럼 서술형으로. 같은 URL로 다시 올리면 새 초안이 생기지 않고 기존 초안이 갱신된다(내용 수정에 이 방법을 써라).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "짧고 명확한 제품 이름" },
        description: { type: "string", description: "한 문단 설명 (미완성이면 지향점까지)" },
        builderNote: { type: "string", description: "(선택) 공개 카드에 말풍선으로 뜨는 짧은 한마디. 문단이 아니라 한 줄, 예: '이게 제 첫 사이드프로젝트예요!'" },
        demoHighlights: { type: "string", description: "시연 영상에서 보여줄 핵심 3~5가지, 서술형, 500자 이내" },
        tags: {
          type: "array",
          items: { type: "string", enum: AI_TOOL_IDS },
          description: "이 작업에 쓴 AI 툴. 목록 밖 철자는 서버가 조용히 버린다.",
        },
        contentType: {
          type: "string",
          enum: ["web-app", "saas", "mobile", "game", "extension", "ai-service", "media", "other"],
        },
        deployUrl: { type: "string", description: "배포된 공개 URL" },
        appUrl: { type: "string", description: "실제 앱 화면 URL (랜딩과 다를 때 — 시연·임베드는 이 주소를 연다)" },
        demoAccess: {
          type: "object",
          description:
            "로그인해야 보이는 앱의 데모 모드 진입 정보. 시연 로봇이 로그인 없이 볼 수 있는 길만 준다 — 계정 아이디/비번은 절대 넣지 말 것(받지 않음).",
          properties: {
            url: { type: "string", description: "데모/게스트 진입 URL 또는 경로 (예 \"/demo\")" },
            params: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "진입 URL에 붙일 추가 쿼리 파라미터 (예 {\"guest\":\"1\"})",
            },
            note: { type: "string", description: "거기서 데모 모드를 보는 법 한두 문장 (500자 이내). impossible이면 왜 불가능한지" },
            impossible: {
              type: "boolean",
              description:
                "게스트 경로가 원천 불가능한 앱 선언 (E2E 암호화·기기 페어링 필수 등). true면 자동 촬영은 랜딩만 담고 리포트에 표기된다 — video 동봉 권장.",
            },
          },
        },
        dir: { type: "string", description: "정적 빌드 디렉터리 절대경로 (deployUrl이 없을 때)" },
        screenshot: { type: "string", description: "썸네일로 쓸 스크린샷 이미지 절대경로 (png/jpg/webp/gif, ≤5MB)" },
        video: { type: "string", description: "직접 만든 시연 영상 절대경로 (mp4/webm, ≤20MB — 있으면 자동 촬영 생략)" },
      },
      required: ["title"],
    },
  };

  // 초안 관리(요청4) — 전부 초안(is_draft) 한정. 공개된 프로젝트는 서버가 409로 거부.
  const DRAFT_TOOLS = [
    {
      name: "list_nookframe_drafts",
      description:
        "내가 Nookframe에 올린 초안(아직 공개 전) 목록을 본다. 공개된 프로젝트는 안 보인다.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "update_nookframe_draft",
      description:
        "Nookframe 초안의 메타데이터(title/description/builderNote/demoHighlights/tags/contentType/demoAccess)를 수정한다. 보낸 필드만 바뀐다. URL·파일 교체는 이 툴로 안 되고, 같은 URL로 publish_to_nookframe를 다시 호출하면 그 초안이 갱신된다. 공개된 프로젝트는 수정 불가.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "초안 id (list_nookframe_drafts로 확인)" },
          title: { type: "string" },
          description: { type: "string" },
          builderNote: { type: "string" },
          demoHighlights: { type: "string" },
          tags: { type: "array", items: { type: "string", enum: AI_TOOL_IDS } },
          contentType: {
            type: "string",
            enum: ["web-app", "saas", "mobile", "game", "extension", "ai-service", "media", "other"],
          },
          demoAccess: {
            type: "object",
            properties: {
              url: { type: "string" },
              params: { type: "object", additionalProperties: { type: "string" } },
              note: { type: "string" },
              impossible: { type: "boolean" },
            },
          },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_nookframe_draft",
      description:
        "Nookframe 초안을 삭제한다(올라간 파일 포함). 공개된 프로젝트는 이 툴로 못 지운다. 유저가 지워달라고 했거나 잘못 올린 초안일 때만 써라.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "초안 id (list_nookframe_drafts로 확인)" } },
        required: ["id"],
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [TOOL, ...DRAFT_TOOLS] }));

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
          const verb = body.upserted ? "기존 초안을 갱신했어요" : "초안으로 올렸어요";
          return { content: [{ type: "text", text: `Nookframe에 ${verb}. 확인하고 공개: ${body.reviewUrl}` }] };
        }
        case "list_nookframe_drafts": {
          const { drafts } = await listDrafts(conn);
          if (!drafts?.length) return { content: [{ type: "text", text: "초안이 없어요." }] };
          const lines = drafts.map((d) => `- ${d.id} · ${d.title}${d.demo_url ? ` · ${d.demo_url}` : ""}`);
          return { content: [{ type: "text", text: `초안 ${drafts.length}개:\n${lines.join("\n")}` }] };
        }
        case "update_nookframe_draft": {
          const { id, ...payload } = a;
          const body = await updateDraft(id, payload, conn);
          return { content: [{ type: "text", text: `초안을 수정했어요. 확인: ${body.reviewUrl}` }] };
        }
        case "delete_nookframe_draft": {
          await deleteDraft(a.id, conn);
          return { content: [{ type: "text", text: "초안을 삭제했어요 (올라간 파일 포함)." }] };
        }
        default:
          return { isError: true, content: [{ type: "text", text: `알 수 없는 툴: ${req.params.name}` }] };
      }
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: `실패: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  });

  await server.connect(new StdioServerTransport());
  // stdio 서버는 연결 후 표준입출력으로 계속 통신 — 프로세스가 종료되지 않게 유지된다.
}
