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
      "Could not load the MCP SDK. Install it with `npm i @modelcontextprotocol/sdk`, or run `npx -y nookframe mcp` instead.",
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
      "The demo script a filming robot follows. You built this app, so you know which screen to open and what to press for the good part to show — do not leave the robot guessing from pixels. This script IS the whole video (the robot films exactly these steps and stops): cover every feature worth showing, 5-8 steps is right (max 10, min 4), in order of importance (the film runs ~30s and is cut from the end — step 1 must be the feature that absolutely cannot be missing). Every step must carry both an action and a selector (or where, if you do not know the selector) — a step with only a goal is a table of contents, not a script, and the server rejects a script made only of those (at least 3 steps must meet this bar). Set hold (seconds, 0.5-4) to linger on a step's result. The robot verifies each step on the real screen and skips what it cannot find, and it never presses login, submit, delete or file-picker controls even if the script asks.",
    properties: {
      steps: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            goal: { type: "string", description: "What this beat proves (max 120 chars)" },
            // 전 스텝에 selector가 있으면 로봇이 비전 없이 DOM에서 직접 조립(더 빠르고 정확, 2026-08-20).
            selector: { type: "string", description: "CSS selector for that control — you know the code, so give the exact one (max 250 chars)" },
            toSelector: { type: "string", description: "CSS selector for the drop target when action=drag" },
            where: { type: "string", description: "How to find it by eye (visible label, position) — the fallback when the selector misses (max 120 chars)" },
            // "focus" = 강조 비트: 조작 없이 필름 카메라가 그 영역을 확대(2026-08-20).
            action: { type: "string", enum: ["click", "type", "drag", "scroll", "hover", "draw", "focus"] },
            text: { type: "string", description: "What to type when action=type (max 60 chars)" },
            expect: { type: "string", description: "What should appear on screen afterwards (max 120 chars)" },
            hold: { type: "number", description: "How many seconds to hold on this step's result (0.5-4). Only for beats that need a slow look" },
          },
          required: ["goal"],
        },
      },
      skip: {
        type: "array",
        items: { type: "string" },
        description: "Things every app has, so they waste a beat (e.g. dark mode or language toggles)",
      },
      prep: { type: "string", description: "(optional) One line of setup before the tour" },
    },
    required: ["steps"],
  };

  const TOOL = {
    name: "publish_to_nookframe",
    description:
      "Upload this project to Nookframe (a portfolio for vibe-coded work) as a draft. You are the AI that built it, so write title/description/demoScript yourself from the repo (README, routes, git log) and pass them in. The description must NOT be one paragraph: it is 2-3 lines separated by newlines (\\n) — it is the first-impression copy laid over the work on the card, and a long line wraps and gets cut off on phones (violations are rejected). Give either deployUrl (a deployed public URL) or dir (absolute path to a local folder — static build output for web apps, the source folder itself for Python/CLI projects). If it is not deployed and needs a server or DB so dir will not do, you may pass a public GitHub repo URL as deployUrl instead (a last resort: the repo is cloned and run — JS repos via npm run dev/start, Python web apps by detecting Streamlit/Gradio/Dash/Django/Flask/FastAPI then pip install + run (Django also gets migrate run for it), and projects with no web screen (CLI tools, bots, backends) are filmed as a live terminal session where the robot types the commands (put the exact commands in demoScript and it gets much better). Private repos fail; apps needing a remote DB get a read-only demo). If the landing page and the actual app screen are different URLs, also pass appUrl (the demo and the embed open appUrl). demoAccess is REQUIRED — the filming robot never logs in, so decide 'what actually works before login' and answer with exactly one of: { url, params, note } if there is a way in without login; { noLogin: true, note: \"one line on what you checked\" } if no login is needed at all and every feature is usable from the first screen (noLogin without note is rejected); { impossible: true, note: \"why\" } if a guest path is fundamentally impossible (E2E encryption, mandatory device pairing). In that last case only the landing page gets filmed, so attaching a video is strongly recommended. Without one of the three the server rejects with 400. Account credentials are not accepted. If you have your own screenshot or demo video, pass absolute paths in screenshot/video (supplying a video skips automatic filming). Order demoScript.steps by importance — step 1 is the feature that absolutely cannot be missing. Uploading the same URL again does not create a new draft, it updates the existing one (use this to edit content).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, clear product name" },
        description: { type: "string", description: "2-3 lines separated by newlines (if unfinished, say where it is headed)" },
        builderNote: { type: "string", description: "(optional) Short one-liner shown as a speech bubble on the public card. One line, not a paragraph — e.g. \"my first side project!\"" },
        demoHighlights: { type: "string", description: "(legacy — can be omitted when demoScript is present) 3-5 highlights in prose, max 500 chars" },
        demoScript: DEMO_SCRIPT_SCHEMA,
        tags: {
          type: "array",
          items: { type: "string", enum: AI_TOOL_IDS },
          description: "AI tools used for this work. Spellings outside the list are silently dropped by the server.",
        },
        contentType: {
          type: "string",
          enum: ["web-app", "saas", "mobile", "game", "extension", "ai-service", "media", "other"],
        },
        deployUrl: { type: "string", description: "Deployed public URL" },
        appUrl: { type: "string", description: "URL of the actual app screen (when it differs from the landing page — the demo and the embed open this one)" },
        demoAccess: {
          type: "object",
          description:
            "Required. The filming robot never logs in — judge not 'does a screen appear' but 'what actually works before login', and answer with exactly one of url, noLogin or impossible. The most common failure is an app that looks fine when logged out but has empty lists and bounces saves to a login screen (a screen did appear, so it is not even caught as a failure). Without one of the three the server rejects with 400. Never include account credentials (they are not accepted).",
          properties: {
            url: { type: "string", description: "Demo/guest entry URL or path (e.g. \"/demo\")" },
            params: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Extra query parameters to append to the entry URL (e.g. {\"guest\":\"1\"})",
            },
            note: { type: "string", description: "One or two sentences on how to reach demo mode there (max 500 chars). If impossible, why it is impossible" },
            impossible: {
              type: "boolean",
              description:
                "Declares that a guest path is fundamentally impossible (E2E encryption, mandatory device pairing, etc.). If true, automatic filming captures only the landing page and says so in the report — attaching a video is recommended.",
            },
            noLogin: {
              type: "boolean",
              description:
                "Declares that no login is needed at all and every feature is usable from the first screen. Do not set it just because the landing page looks fine — only after checking the actual routes and guards.",
            },
          },
        },
        dir: { type: "string", description: "Absolute path of the local directory to upload (when there is no deployUrl — static build output, or a Python/CLI source folder)" },
        screenshot: { type: "string", description: "Absolute path of a screenshot image to use as the thumbnail (png/jpg/webp/gif, <=5MB)" },
        video: { type: "string", description: "Absolute path of your own demo video (mp4/webm, <=20MB — supplying one skips automatic filming)" },
      },
      required: ["title"],
    },
  };

  // 초안 관리(요청4) — 전부 초안(is_draft) 한정. 공개된 프로젝트는 서버가 409로 거부.
  const DRAFT_TOOLS = [
    {
      name: "list_nookframe_drafts",
      description:
        "List my Nookframe drafts (not yet published). Published projects do not appear.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "update_nookframe_draft",
      description:
        "Edit a Nookframe draft's metadata (title/description/builderNote/demoHighlights/demoScript/tags/contentType/demoAccess). Only the fields you send change. This tool cannot swap the URL or the files — call publish_to_nookframe again with the same URL and that draft is updated. Published projects cannot be edited.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Draft id (find it with list_nookframe_drafts)" },
          title: { type: "string" },
          description: { type: "string" },
          builderNote: { type: "string" },
          demoHighlights: { type: "string" },
          demoScript: { type: "object", description: "Demo script — same shape as publish_to_nookframe's demoScript { steps, skip?, prep? }" },
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
        "Delete a Nookframe draft (uploaded files included). Published projects cannot be deleted with this tool. Use it only when the user asked for the deletion, or for a draft uploaded by mistake.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Draft id (find it with list_nookframe_drafts)" } },
        required: ["id"],
      },
    },
  ];

  // 재촬영(2026-08-26) — 공개된 작품에도 쓸 수 있는 유일한 툴이다. 그래도 공개
  // 데이터는 안 바뀐다: 새 대본은 대기 상태로 들어가고 주인이 눌러야 승격된다.
  const RERECORD_TOOL = {
    name: "rerecord_nookframe_demo",
    description:
      "Submit a rewritten demo script when the owner is unhappy with an already-published Nookframe work's demo video. Use it when you were handed the prompt the owner generated by pressing [Request re-record] on Nookframe — that prompt contains the project id, the full script currently in place, and the owner's own complaint, so leave the steps that are fine and fix only what was called out. Important: submitting does NOT change the video. The new script is stored in a PENDING slot, and filming starts only after the owner reviews it in the dashboard and presses [Re-record] — you must say this when you report back to the human. The script gate is the same as publishing (at least 4 steps, of which 3 or more carry both an action and a selector).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Project id — it is written in the re-record prompt the owner gave you" },
        demoScript: DEMO_SCRIPT_SCHEMA,
        note: { type: "string", description: "One line on what changed and why (the owner reads this in the dashboard to decide, max 1000 chars)" },
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
          const verb = body.upserted ? "Updated the existing draft" : "Uploaded as a draft";
          // 저장 에코를 툴 결과에 실어야 호출한 AI가 자기 payload가 어디까지
          // 살아남았는지(태그 철자·분류·500자 절단) 스스로 확인하고 고칠 수 있다.
          const echo = formatAccepted(body.accepted);
          return { content: [{ type: "text", text:
            `${verb} on Nookframe. Review and publish: ${body.reviewUrl}${echo.length ? `\n${echo.join("\n")}` : ""}` }] };
        }
        case "list_nookframe_drafts": {
          const { drafts } = await listDrafts(conn);
          if (!drafts?.length) return { content: [{ type: "text", text: "No drafts." }] };
          const lines = drafts.map((d) => `- ${d.id} · ${d.title}${d.demo_url ? ` · ${d.demo_url}` : ""}`
            + ` · [${d.tags?.length ? d.tags.join(", ") : "no AI tools"} / ${d.content_type || "no type"}]`);
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
