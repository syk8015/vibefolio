// 발행 payload 스키마 — 한 출처(2026-09-15). MCP 서버(mcp.js)의 툴 입력 스키마와
// `nookframe schema` 명령이 둘 다 여기서 읽는다. 둘이 갈라지면 CLI로 올리는 AI와
// MCP로 올리는 AI가 서로 다른 규칙을 보게 된다.
//
// cli/는 독립 배포 패키지라 레포 코드를 import 못 한다(AGENTS.md). 아래 목록은
// 서버(lib/projectTaxonomy.ts)의 사본이라, 서버 쪽이 바뀌면 여기를 손으로 맞춘다.

// AI_TOOLS 화이트리스트 사본. 서버가 이 철자만 정확히 받고 나머지는 조용히 버린다.
export const AI_TOOL_IDS = [
  "ChatGPT", "Claude Code", "Cursor", "GitHub Copilot", "Gemini", "v0",
  "Bolt.new", "Windsurf", "Lovable", "Replit AI", "Devin", "Aider",
  "Continue.dev", "Codeium", "Amazon Q", "Perplexity", "Midjourney",
  "DALL-E", "Stable Diffusion", "Ideogram", "Flux", "Runway", "Kling",
  "Pika", "Suno", "ElevenLabs",
];

// CONTENT_TYPES 사본 — 분류 id 8개.
export const CONTENT_TYPES = ["web-app", "saas", "mobile", "game", "extension", "ai-service", "media", "other"];

// 대상 화면(2026-09-15) — publish·update 공용. 서버 TARGET_DEVICES와 같은 두 값만 받는다.
export const TARGET_DEVICE_SCHEMA = {
  type: "string",
  enum: ["mobile", "desktop"],
  description:
    "Required. The screen this app was mainly designed for: \"mobile\" = phone screens (a narrow single column, a bottom tab bar, touch-first); \"desktop\" = computer browsers (wide layouts, sidebars, hover). If it works on both, pick the one it was designed for first. Not the same as contentType — a phone-first web app is contentType \"web-app\" with targetDevice \"mobile\". The owner's draft preview is framed as a phone or a desktop screen from this answer. The demo robot itself always films a 1280x720 desktop browser, so demoScript selectors must match the layout at that size.",
};

// 촬영 대본 스키마 — publish와 rerecord가 **같은 형식**을 쓴다(재촬영이 품질을
// 낮추는 길이 되면 안 되므로 서버 게이트도 동일).
export const DEMO_SCRIPT_SCHEMA = {
  type: "object",
  description:
    "The demo script a filming robot follows. You built this app, so you know which screen to open and what to press for the good part to show — do not leave the robot guessing from pixels. This script IS the whole video (the robot films exactly these steps and stops): cover every feature worth showing, 5-8 steps is right (max 10, min 4), in order of importance (the film runs ~30s and is cut from the end — step 1 must be the feature that absolutely cannot be missing). Every step must carry both an action and a selector (or where, if you do not know the selector) — a step with only a goal is a table of contents, not a script, and the server rejects a script made only of those (at least 3 steps must meet this bar). Set hold (seconds, 0.5-4) to linger on a step's result. The robot verifies each step on the real screen and skips what it cannot find. It films a 1280x720 desktop browser, so selectors must match the layout at that size. It has no account (cannot log in) and never opens file pickers; clicks that save, send or delete are skipped or answered with a fake success that never reaches the real server, so do not build a step on a result only the server can produce (an AI reply, data reloaded from the database).",
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

// 로그인 질문 답(데모 진입) — 서버 게이트가 url·noLogin·impossible 중 하나를 요구한다.
// 필드는 publish와 update_nookframe_draft가 같이 쓴다(update 쪽 사본엔 noLogin이 빠져 있었다).
export const DEMO_ACCESS_PROPERTIES = {
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
};

export const DEMO_ACCESS_SCHEMA = {
  type: "object",
  description:
    "Required. The filming robot never logs in — judge not 'does a screen appear' but 'what actually works before login', and answer with exactly one of url, noLogin or impossible. The most common failure is an app that looks fine when logged out but has empty lists and bounces saves to a login screen (a screen did appear, so it is not even caught as a failure). Without one of the three the server rejects with 400. Never include account credentials (they are not accepted).",
  properties: DEMO_ACCESS_PROPERTIES,
};

// publish_to_nookframe 툴 설명 = `nookframe schema` 문서의 description.
export const PUBLISH_DESCRIPTION =
  "Upload this project to Nookframe (a portfolio for vibe-coded work) as a draft. You are the AI that built it, so write title/description/demoScript yourself from the repo (README, routes, git log) and pass them in. The description must NOT be one paragraph: it is 2-3 lines separated by newlines (\\n) — it is the first-impression copy laid over the work on the card, and a long line wraps and gets cut off on phones (a single paragraph, or any line over 52 columns where a CJK character counts as 2, is rejected). Give either deployUrl (a deployed public URL) or dir (absolute path to a local folder — static build output for web apps, the source folder itself for Python/CLI projects). If it is not deployed and needs a server or DB so dir will not do, you may pass a public GitHub repo URL as deployUrl instead (a last resort: the repo is cloned and run — JS repos via npm run dev/start, Python web apps by detecting Streamlit/Gradio/Dash/Django/Flask/FastAPI then pip install + run (Django also gets migrate run for it), and projects with no web screen (CLI tools, bots, backends) are filmed as a live terminal session where the robot types the commands (put the exact commands in demoScript and it gets much better). Private repos fail; apps needing a remote DB get a read-only demo). If the landing page and the actual app screen are different URLs, also pass appUrl (the demo and the embed open appUrl). demoAccess is REQUIRED — the filming robot never logs in, so decide 'what actually works before login' and answer with exactly one of: { url, params, note } if there is a way in without login; { noLogin: true, note: \"one line on what you checked\" } if no login is needed at all and every feature is usable from the first screen (noLogin without note is rejected); { impossible: true, note: \"why\" } if a guest path is fundamentally impossible (E2E encryption, mandatory device pairing). In that last case only the landing page gets filmed, so attaching a video is strongly recommended. Without one of the three the server rejects with 400. Account credentials are not accepted. The film and card are public, so screens the robot opens must show fake or sample data, never real people's records; if the app needs a demo mode to be filmable, ask the human before changing their code or deploying. targetDevice is REQUIRED too: \"mobile\" if the app was designed mainly for phone screens, \"desktop\" if for computer browsers (not the same as contentType) — the owner's draft preview is framed from it, while the robot always films a 1280x720 desktop browser. If you have your own screenshot or demo video, pass absolute paths in screenshot/video (supplying a video skips automatic filming). Order demoScript.steps by importance — step 1 is the feature that absolutely cannot be missing. Uploading the same URL again does not create a new draft, it updates the existing one (use this to edit content); a file upload (dir) has no URL to match, so to replace its files — or to change the URL — pass draftId, the draft id from the publish result. When you report back, tell the human it is a DRAFT: nothing is public until they open the review link and press publish.";

export const PUBLISH_INPUT_SCHEMA = {
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
      enum: CONTENT_TYPES,
    },
    targetDevice: TARGET_DEVICE_SCHEMA,
    deployUrl: { type: "string", description: "Deployed public URL" },
    appUrl: { type: "string", description: "URL of the actual app screen (when it differs from the landing page — the demo and the embed open this one)" },
    draftId: {
      type: "string",
      description: "(optional) Id of one of your drafts to update in place — it is in every publish result and in list_nookframe_drafts. Without it a draft is matched by URL, so re-uploading a folder (dir) or changing the URL leaves a second draft behind; with it, that draft's fields and its files or URL are replaced. Published projects are refused.",
    },
    demoAccess: DEMO_ACCESS_SCHEMA,
    // 로컬 경로 셋은 서버로 가지 않는다 — MCP 핸들러와 CLI publish가 꺼내서 파일로 올린다.
    dir: { type: "string", description: "Absolute path of the local directory to upload (when there is no deployUrl — static build output, or a Python/CLI source folder)" },
    screenshot: { type: "string", description: "Absolute path of a screenshot image to use as the thumbnail (png/jpg/webp/gif, <=5MB)" },
    video: { type: "string", description: "Absolute path of your own demo video (mp4/webm, <=20MB — supplying one skips automatic filming)" },
  },
  required: ["title", "targetDevice"],
};

// `nookframe schema` 출력 — 표준 JSON Schema 문서. 규칙 설명(description)까지 실어야
// CLI로 올리는 AI도 MCP 툴 설명과 같은 안내를 본다.
export function publishPayloadSchema() {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Nookframe publish payload",
    description: PUBLISH_DESCRIPTION,
    ...PUBLISH_INPUT_SCHEMA,
  };
}
