import { getToken, getOrigin } from "./config.js";
import { runPublish } from "./publish.js";
import { formatAccepted } from "./echo.js";
import { listDrafts, updateDraft, deleteDraft } from "./drafts.js";
import { submitRerecord, formatRerecord } from "./rerecord.js";

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

  // 촬영 대본 스키마 — publish와 rerecord가 **같은 형식**을 쓴다(재촬영이 품질을
  // 낮추는 길이 되면 안 되므로 서버 게이트도 동일). 한 곳에서 정의해 갈라지지 않게.
  const DEMO_SCRIPT_SCHEMA = {
    type: "object",
    description:
      "자동 시연 로봇이 따라 찍는 촬영 대본. 네가 이 앱을 만들었으니 어떤 화면에서 뭘 눌러야 핵심이 보이는지 안다 — 로봇이 픽셀만 보고 추측하게 두지 마. 이 대본이 곧 영상 전체다(로봇은 딱 이 스텝들만 찍고 끝냄): 보여줄 가치가 있는 기능을 빠짐없이, 5~8스텝 적정(최대 10, 최소 3), 중요한 순서대로(필름 ~30초, 뒤부터 잘림 — 1번이 절대 빠지면 안 되는 기능). hold(초, 0.5~4)를 주면 그 스텝 결과를 오래 보여준다. 로봇은 각 스텝을 실제 화면에서 확인하고 못 찾으면 건너뛰며, 대본에 있어도 로그인/제출/삭제/파일선택은 절대 안 누른다.",
    properties: {
      steps: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            goal: { type: "string", description: "이 비트가 증명하는 것 (120자 이내)" },
            // 전 스텝에 selector가 있으면 로봇이 비전 없이 DOM에서 직접 조립(더 빠르고 정확, 2026-08-20).
            selector: { type: "string", description: "그 컨트롤의 CSS 셀렉터 — 코드를 아는 네가 정확한 걸 줘라 (250자 이내)" },
            toSelector: { type: "string", description: "action=drag일 때 놓을 곳의 CSS 셀렉터" },
            where: { type: "string", description: "눈으로 찾는 법(보이는 라벨·위치) — 셀렉터가 빗나갔을 때의 폴백 (120자 이내)" },
            // "focus" = 강조 비트: 조작 없이 필름 카메라가 그 영역을 확대(2026-08-20).
            action: { type: "string", enum: ["click", "type", "drag", "scroll", "hover", "draw", "focus"] },
            text: { type: "string", description: "action=type일 때 입력할 내용 (60자 이내)" },
            expect: { type: "string", description: "하고 나면 화면에 나타나야 하는 것 (120자 이내)" },
            hold: { type: "number", description: "이 스텝의 결과를 몇 초 보여줄지 (0.5~4). 천천히 봐야 하는 비트에만" },
          },
          required: ["goal"],
        },
      },
      skip: {
        type: "array",
        items: { type: "string" },
        description: "모든 앱에 다 있어서 비트가 아까운 것들 (예: 다크 모드·언어 토글)",
      },
      prep: { type: "string", description: "(선택) 투어 전 준비 한 줄" },
    },
    required: ["steps"],
  };

  const TOOL = {
    name: "publish_to_nookframe",
    description:
      "이 프로젝트를 Nookframe(바이브코딩 포트폴리오)에 초안으로 올린다. 당신이 이 프로젝트를 만든 AI로서 레포(README·라우트·git log)를 근거로 title/description/demoScript(촬영 대본)를 직접 작성해 전달하라. deployUrl(배포된 공개 URL) 또는 dir(로컬 폴더 절대경로 — 웹앱은 정적 빌드 산출물, 파이썬·CLI 프로젝트는 소스 폴더 그대로) 중 하나를 준다. 미배포+서버·DB가 필요해 dir로 안 되면 deployUrl에 공개 GitHub 저장소 URL을 대신 줘도 된다(clone 후 자동 실행하는 최후 수단 — JS 리포는 npm run dev/start, 파이썬 웹앱은 Streamlit·Gradio·Dash·Django·Flask·FastAPI 감지 후 pip install+실행(Django는 migrate도 대신 실행), 웹 화면이 없는 프로젝트(CLI 도구·봇·백엔드)는 라이브 터미널에서 로봇이 명령어를 쳐 보는 영상으로 촬영(demoScript에 정확한 명령어를 적으면 훨씬 좋아짐). 비공개 저장소는 실패, 원격 DB 앱은 읽기전용 데모). 랜딩과 실제 앱 화면 주소가 다르면 appUrl에 앱 URL을 함께 줘라(시연·임베드는 appUrl을 연다). demoAccess는 필수다 — 시연 로봇은 절대 로그인하지 않으므로 '로그인 전에 뭐가 실제로 작동하는가'를 판단해 셋 중 하나로 답하라: 로그인 없이 들어갈 길이 있으면 { url, params, note }, 로그인이 아예 필요 없고 첫 화면부터 전 기능이 눌리면 { noLogin: true }, 게스트 경로가 원천 불가능하면(E2E 암호화·기기 페어링 필수 등) { impossible: true, note: \"이유\" }(이 경우 랜딩만 찍히니 video 동봉 강력 권장). 셋 다 없으면 서버가 400으로 거절한다. 계정 아이디/비번은 받지 않는다. 직접 찍은 스크린샷·시연 영상 파일이 있으면 screenshot/video에 절대경로로 줘라(영상을 주면 자동 촬영은 생략된다). demoScript.steps는 중요한 순서대로 — 1번이 절대 빠지면 안 되는 핵심 기능이다. 같은 URL로 다시 올리면 새 초안이 생기지 않고 기존 초안이 갱신된다(내용 수정에 이 방법을 써라).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "짧고 명확한 제품 이름" },
        description: { type: "string", description: "한 문단 설명 (미완성이면 지향점까지)" },
        builderNote: { type: "string", description: "(선택) 공개 카드에 말풍선으로 뜨는 짧은 한마디. 문단이 아니라 한 줄, 예: '이게 제 첫 사이드프로젝트예요!'" },
        demoHighlights: { type: "string", description: "(구식 — demoScript가 있으면 생략 가능) 시연 핵심 서술형 3~5가지, 500자 이내" },
        demoScript: DEMO_SCRIPT_SCHEMA,
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
            "필수. 시연 로봇은 절대 로그인하지 않는다 — 화면이 보이느냐가 아니라 '로그인 전에 뭐가 실제로 작동하느냐'를 판단하고, url·noLogin·impossible 중 딱 하나로 답하라. 로그아웃 상태에서 멀쩡해 보이지만 목록이 비어 있고 저장이 로그인으로 튕기는 앱이 가장 흔한 실패다(화면은 떴으니 실패로 잡히지도 않는다). 셋 다 없으면 서버가 400으로 거절한다. 계정 아이디/비번은 절대 넣지 말 것(받지 않음).",
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
            noLogin: {
              type: "boolean",
              description:
                "로그인이 아예 필요 없고 첫 화면부터 전 기능이 눌린다는 선언. 랜딩이 멀쩡해 보인다고 쓰지 말고 실제 라우트·가드를 확인한 뒤에만 true로 줄 것.",
            },
          },
        },
        dir: { type: "string", description: "올릴 로컬 디렉터리 절대경로 (deployUrl이 없을 때 — 정적 빌드 산출물 또는 파이썬·CLI 소스 폴더)" },
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
        "Nookframe 초안의 메타데이터(title/description/builderNote/demoHighlights/demoScript/tags/contentType/demoAccess)를 수정한다. 보낸 필드만 바뀐다. URL·파일 교체는 이 툴로 안 되고, 같은 URL로 publish_to_nookframe를 다시 호출하면 그 초안이 갱신된다. 공개된 프로젝트는 수정 불가.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "초안 id (list_nookframe_drafts로 확인)" },
          title: { type: "string" },
          description: { type: "string" },
          builderNote: { type: "string" },
          demoHighlights: { type: "string" },
          demoScript: { type: "object", description: "촬영 대본 — publish_to_nookframe의 demoScript와 같은 형식 { steps, skip?, prep? }" },
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

  // 재촬영(2026-08-26) — 공개된 작품에도 쓸 수 있는 유일한 툴이다. 그래도 공개
  // 데이터는 안 바뀐다: 새 대본은 대기 상태로 들어가고 주인이 눌러야 승격된다.
  const RERECORD_TOOL = {
    name: "rerecord_nookframe_demo",
    description:
      "이미 공개된 Nookframe 작품의 시연 영상이 마음에 안 들 때, 다시 쓴 촬영 대본을 제출한다. 주인이 Nookframe에서 [재촬영 요청]을 눌러 만든 프롬프트를 받았을 때 쓰는 툴이다 — 그 프롬프트에 프로젝트 id·지금 걸려 있는 대본 전문·주인이 직접 쓴 불만이 들어 있으니, 멀쩡한 스텝은 두고 지적된 것만 고쳐라. 중요: 제출해도 영상은 바로 바뀌지 않는다. 새 대본은 **대기 상태**로 저장되고, 주인이 대시보드에서 확인하고 [재촬영]을 눌러야 촬영이 시작된다 — 사람에게 보고할 때 이 사실을 반드시 함께 말해라. 대본 게이트는 발행과 동일(최소 3스텝).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "프로젝트 id — 주인이 준 재촬영 프롬프트에 적혀 있다" },
        demoScript: DEMO_SCRIPT_SCHEMA,
        note: { type: "string", description: "무엇을 왜 바꿨는지 한 줄 (주인이 대시보드에서 이걸 보고 판단한다, 1000자 이내)" },
      },
      required: ["id", "demoScript"],
    },
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [TOOL, RERECORD_TOOL, ...DRAFT_TOOLS],
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
          const verb = body.upserted ? "기존 초안을 갱신했어요" : "초안으로 올렸어요";
          // 저장 에코를 툴 결과에 실어야 호출한 AI가 자기 payload가 어디까지
          // 살아남았는지(태그 철자·분류·500자 절단) 스스로 확인하고 고칠 수 있다.
          const echo = formatAccepted(body.accepted);
          return { content: [{ type: "text", text:
            `Nookframe에 ${verb}. 확인하고 공개: ${body.reviewUrl}${echo.length ? `\n${echo.join("\n")}` : ""}` }] };
        }
        case "list_nookframe_drafts": {
          const { drafts } = await listDrafts(conn);
          if (!drafts?.length) return { content: [{ type: "text", text: "초안이 없어요." }] };
          const lines = drafts.map((d) => `- ${d.id} · ${d.title}${d.demo_url ? ` · ${d.demo_url}` : ""}`
            + ` · [${d.tags?.length ? d.tags.join(", ") : "AI 툴 없음"} / ${d.content_type || "분류 없음"}]`);
          return { content: [{ type: "text", text: `초안 ${drafts.length}개:\n${lines.join("\n")}` }] };
        }
        case "update_nookframe_draft": {
          const { id, ...payload } = a;
          const body = await updateDraft(id, payload, conn);
          const echo2 = formatAccepted(body.accepted);
          return { content: [{ type: "text", text:
            `초안을 수정했어요. 확인: ${body.reviewUrl}${echo2.length ? `\n${echo2.join("\n")}` : ""}` }] };
        }
        case "rerecord_nookframe_demo": {
          const { id, ...body } = a;
          const res = await submitRerecord(id, body, conn);
          return { content: [{ type: "text", text: formatRerecord(res).join("\n") }] };
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
