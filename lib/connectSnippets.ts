// Nookframe Connect — "당신의 AI에 붙여넣으세요" 정규 스니펫. ConnectPanel·/publish
// 페이지·docs가 같은 출처를 쓰도록 한 곳에 둔다. 프롬프트는 프로젝트를 "만든" AI가
// 레포를 introspection해 카피를 대신 쓰게 유도하고, 셸 유무에 따라 CLI 실행 또는
// JSON 출력으로 환경 자동적응한다.
//
// 요청5(2026-08-14): 토큰 발급 단계를 별도 화면에서 없애고, 복사 순간 자동 발급된
// 토큰을 프롬프트 1단계(`npx nookframe login <token>`)에 내장한다. 화면 미리보기는
// token 없이 호출 — 자리표시 문구가 들어간다.

export const NPX_PUBLISH = "npx nookframe@latest publish";

// 자동발급 토큰의 name 센티널 — 서버(app/api/tokens)가 재발급 시 이전 것을 찾아
// 폐기하는 키이자, 목록 UI가 현지화 라벨로 바꿔 보여주는 판별값. 클라이언트에서도
// import하므로 SERVER-ONLY인 lib/apiToken.ts가 아니라 여기 둔다.
export const AUTO_TOKEN_NAME = "prompt-auto";

export function loginCommand(token: string): string {
  return `npx nookframe@latest login ${token}`;
}

// MCP 연결(2026-09-04, 인터뷰 ⑦ 터미널 쪽). 프롬프트 붙여넣기·JSON 옮기기가 통째로
// 사라지는 길이라 연결 탭에 같이 둔다. 토큰 이름은 자동 토큰처럼 센티널 —
// 서버가 재복사 때 이전 것을 폐기해 토큰 상한(MAX_TOKENS_PER_USER)에 안 걸린다.
export const MCP_TOKEN_NAME = "mcp-auto";
export const MCP_TOKEN_PLACEHOLDER = "<a fresh token is filled in here when you press copy>";

export function mcpClaudeCodeCommand(token: string = MCP_TOKEN_PLACEHOLDER): string {
  return `claude mcp add nookframe -e NOOKFRAME_TOKEN=${token} -- npx -y nookframe mcp`;
}

export function mcpConfigJson(token: string = MCP_TOKEN_PLACEHOLDER): string {
  return JSON.stringify(
    { mcpServers: { nookframe: { command: "npx", args: ["-y", "nookframe", "mcp"], env: { NOOKFRAME_TOKEN: token } } } },
    null, 2,
  );
}

// 프롬프트 본문은 언제나 영어다(2026-09-05 사용자 확정). 같은 내용을 영어로
// 쓰면 토큰이 절반쯤 줄고, 모델이 지시를 더 곧이곧대로 따른다. 대신 **AI가
// 만들어내는 카피**(제목·소개글·한마디)는 그 사람의 프레임에 그대로 나가므로
// 화면 언어를 따라야 한다 — 그 언어를 프롬프트가 못박아 준다.
export function outputLanguageLine(locale: "ko" | "en"): string {
  if (locale === "en") {
    return "LANGUAGE — write every human-readable string you produce (title, description, builderNote, notes) in English.";
  }
  return "LANGUAGE — this owner's page is Korean, so write every human-readable string you produce (title, description, builderNote, notes) in KOREAN. Do NOT translate JSON keys, enum values (contentType, action names) or tag spellings — those stay exactly as written below.";
}

export function pastePrompt(
  origin: string,
  locale: "ko" | "en" = "ko",
  token?: string,
): string {
  const tokenArg = token ?? MCP_TOKEN_PLACEHOLDER;
  const login = loginCommand(tokenArg);
  return `Publish this project to Nookframe (a vibe-coding portfolio).

${outputLanguageLine(locale)}

You're the AI that built this project, so read the repo yourself and describe it on my behalf:
1) If you have a shell, first run this once to save my connect token (skip if you have no shell):
   ${login}
2) Investigate from the README, package.json, the actual routes/screens, and git log. If it's still half-built, also work out what it was going to be.
3) Build a publish payload (JSON) with these fields:
   • title — a short, clear product name
   • description — the intro that sits ON TOP of the work on your public card, so first impressions live or die here. Do NOT write a paragraph. Write THREE short lines separated by newlines (\\n), where the first two modify and the last one names what it is:
       For people who create with AI
       with demo videos recorded automatically
       a live portfolio you can actually touch
     Keep each line short (~20 CJK / ~40 Latin characters) so it doesn't wrap on a phone. Only 3 lines show on the card. A single paragraph, or any line too long to fit, is rejected (it must be 2–3 lines), and so is anything over 200 characters
   • builderNote — (optional) a short one-liner shown as a speech bubble on the public card. One line, not a paragraph — e.g. "This is my first side project!"
   • demoScript — **REQUIRED** (the one exception: attaching your own demo "video", which skips auto-recording). A publish without it is rejected with an error telling you to write one. The filming script the auto-demo robot follows. You BUILT this app, so you know which screen shows what and which control proves the core value — don't make the robot guess from pixels. Shape:
       { "steps": [ { "goal": "what this beat proves", "selector": "the control's CSS selector — you know the code, give the exact one", "where": "how to FIND it by eye (visible label/position) — the fallback when a selector misses", "action": "click|type|drag|scroll|hover|draw|focus", "toSelector": "(drag only) CSS selector of the drop target", "text": "what to type (type only)", "expect": "what the screen should show right after", "hold": 2 } ],
         "skip": ["things NOT worth a beat because every app has them — e.g. a dark-mode or language toggle"],
         "prep": "one optional setup line before the tour" }
     Your script IS the film — the robot shoots exactly these steps and stops, so cover every feature worth showing: 5–8 steps is the sweet spot (min 4, max 10). Order = importance; the film is ~30s and gets cut from the END, so step 1 is the one feature the demo must not miss. "hold" (seconds, 0.5–4) keeps that step's result on screen longer — use it on beats that deserve a pause. Every step needs BOTH an action and a selector (or where, if you only know the UI) — a step with just a goal is a table of contents, not a script, and a script made of those is rejected (at least 3 steps must meet this bar). The robot verifies each step on the live screen and skips what it can't find; it never logs in, submits, deletes, or opens file pickers even if a step asks. SELECTORS MATTER MOST: when EVERY step carries a selector (and drags carry toSelector), the robot skips the vision pass entirely and assembles the film straight from the DOM — faster, cheaper, and pixel-exact framing. You built this app, so give real selectors for every step; if any selector fails on the live page the robot falls back to reading the screen. action "focus" is the emphasis device: the film's camera MAGNIFIES that area for the beat (nothing is clicked) — use it for "let the viewer study this" moments like a playing video or a result panel
   • tags — which AI tools were used to build this. Pick from this exact list (anything else is silently dropped): ChatGPT, Claude Code, Cursor, GitHub Copilot, Gemini, v0, Bolt.new, Windsurf, Lovable, Replit AI, Devin, Aider, Continue.dev, Codeium, Amazon Q, Perplexity, Midjourney, DALL-E, Stable Diffusion, Ideogram, Flux, Runway, Kling, Pika, Suno, ElevenLabs
   • contentType — one of web-app | saas | mobile | game | extension | ai-service | media | other
   • deployUrl — the deployed public URL (vercel/netlify, etc.). If it isn't deployed: prefer a file upload first — a static build output for web apps, or the source folder as-is for Python/CLI projects (no need to make the code public). If that won't work (the app needs a server/database), you can instead give the public GitHub repo URL — it's a last resort that clones and runs the app automatically: JS repos via npm run dev/start, Python web apps (Streamlit/Gradio/Dash/Django/Flask/FastAPI) via pip install + the framework's own launcher (Django also gets migrate run for you), PHONE APPS built with Flutter, Expo or React Native by compiling their web target (flutter build web / expo export --platform web) and filming the real running app in a browser — so send the source, not screenshots, and a project with no web screen at all (a CLI tool, a bot, a backend) gets filmed as a live terminal where the demo robot types its commands — a demoScript with the exact commands to type makes that film dramatically better (fails on private repos; apps using a remote database get demoted to a read-only demo). A NATIVE phone or desktop app with no web target at all (Swift/SwiftUI, Kotlin/Jetpack Compose, Electron-only, Unity) cannot be filmed by the robot — attach your own demo \"video\" for those, which skips auto-recording entirely
   • appUrl — if the landing page and the actual app live at different URLs (e.g. / is the intro, /app is the real app), the app URL the demo/embed should open. Give BOTH appUrl and deployUrl when they differ and you aren't sure which one shows more — right before filming, the demo robot loads each and picks whichever screen actually shows the product (an app URL that's blank until you log in loses to a real landing page). appUrl is what the demo films and what the card's open-link points to, either way
   • demoAccess — REQUIRED, and the answer decides whether this film shows anything at all. The demo robot NEVER logs in. So do not only ask "is the screen visible without login?" — ask "does anything actually WORK before logging in?". Most apps look fine logged-out and then do nothing: the list is empty, saving bounces to a sign-in page, the dashboard is a shell. That is the single most common way a demo comes out worthless, and it is not detected as a failure, because a screen did appear. Answer with exactly ONE of these three:
     – there is a way in without logging in → { "url": "/demo", "params": {"guest":"1"}, "note": "how to reach demo mode from there" }. Look hard before giving up: a demo/guest/preview route, a seeded read-only account behind a magic-link path, a ?demo=1 flag, a public sample project URL. If none exists, adding one is the single highest-value thing you can do for this film — a tiny "/demo" route that seeds fake data and skips auth is usually a few lines
     – login genuinely isn't needed AND every feature works from the first screen → { "noLogin": true, "note": "one line of evidence — e.g. no auth guard in middleware or the first screen; the list renders from seed data" }. Only claim this after opening the actual routes/guards, not from the landing page looking nice — a bare noLogin with no note is rejected
     – a guest path is fundamentally impossible (E2E-encrypted, device pairing, real payments) → { "impossible": true, "note": "why" } (rejected without the note). Only the landing page gets filmed, so attach your own "video" as well
     NEVER include account IDs or passwords — they are not accepted, and publishing is rejected without one of the three answers above
4) If you have a shell: run ${NPX_PUBLISH} --json '<the JSON above>' (the token was saved in step 1).
   If you have a screenshot or a demo video you made, add --screenshot <path> / --video <path> (image png/jpg/webp/gif ≤5MB; video mp4/webm ≤20MB — providing a video replaces the auto-recorded demo).
   If you don't have a shell: print the JSON in one \`\`\`json code block, then put this link on its own line right after it so I can click straight through: ${origin}/publish — I'll paste the JSON there.
   To revise something already pushed, publish again with the same URL — the existing draft is updated in place, no duplicates.`;
}
