// Nookframe Connect — "당신의 AI에 붙여넣으세요" 정규 스니펫. ConnectPanel·/publish
// 페이지·docs가 같은 출처를 쓰도록 한 곳에 둔다. 프롬프트는 프로젝트를 "만든" AI가
// 레포를 introspection해 카피를 대신 쓰게 유도하고, 셸 유무에 따라 CLI 실행 또는
// JSON 출력으로 환경 자동적응한다.
//
// 요청5(2026-08-14): 토큰 발급 단계를 별도 화면에서 없애고, 복사 순간 발급된 값을
// 프롬프트 1단계(`npx nookframe login <…>`)에 내장한다. 화면 미리보기는 값 없이
// 호출 — 자리표시 문구가 들어간다.
//
// 2026-09-16: 그 "값"이 raw PAT에서 **1회용 페어링 코드**로 바뀌었다. 프롬프트는 AI
// 채팅창에 붙여넣는 물건이라, 살아 있는 크리덴셜을 박으면 대화 기록에 영구히 남는다.
// 코드는 30분·1회용이고 Bearer로 쓸 수 없다 — `login <코드>`가 /api/connect/exchange에서
// 진짜 토큰으로 바꿔 저장한다. MCP 설정 명령의 토큰은 **그대로 토큰**이다(터미널에
// 붙여넣는 물건이라 대화 기록에 안 남는다).

export const NPX_PUBLISH = "npx nookframe@latest publish";
// 발행 payload의 필드·규칙을 기계가 읽는 형태로(JSON Schema). 0.1.13부터 있고 MCP 툴
// 스키마와 같은 출처다 — 프롬프트가 알려주지 않으면 CLI로 올리는 AI는 있는 줄도 모른다(09-16).
export const NPX_SCHEMA = "npx nookframe@latest schema";
// 발행 전 사전 검사(서버 드라이런, 0.1.15). 거절 사유를 **올리기 전에** 같은 코드로
// 받아보는 유일한 길 — 게이트 판정을 CLI에 복제하지 않기로 한 결정의 다른 쪽 절반이다.
export const NPX_CHECK = "npx nookframe@latest check";

// 자동발급 토큰의 name 센티널 — 서버(app/api/tokens)가 재발급 시 이전 것을 찾아
// 폐기하는 키이자, 목록 UI가 현지화 라벨로 바꿔 보여주는 판별값. 클라이언트에서도
// import하므로 SERVER-ONLY인 lib/apiToken.ts가 아니라 여기 둔다.
export const AUTO_TOKEN_NAME = "prompt-auto";

// 화면 미리보기(복사 전)에 들어가는 자리표시 문구. 토큰 자리표시와 문장이 달라야
// 한다 — 여기 들어갈 물건이 토큰이 아니라 1회용 코드라는 걸 읽는 사람이 알아야 한다.
export const CONNECT_CODE_PLACEHOLDER = "<a one-time connect code is filled in here when you press copy>";

/** `login`이 받는 값은 **페어링 코드**다(`nf_code_…`). 코드는 Bearer로 쓸 수 없고, CLI가 서버에서 토큰으로 바꿔 저장한다. */
export function loginCommand(code: string): string {
  return `npx nookframe@latest login ${code}`;
}

/**
 * 셸은 있는데 npx를 못 쓰는 AI(노드 없음·npm 저장소 막힘)를 위한 curl 길(2026-10-02).
 * 예전엔 재촬영 프롬프트에만 있어서, 연결·고쳐달라기 프롬프트를 받은 AI는 거기서 멈췄다.
 * **반드시 두 번 부른다** — 코드를 토큰으로 바꾸고, 그 토큰으로 보낸다. 한 번으로 줄이면
 * 코드가 Authorization 헤더에 실려 401(`PAIRING_CODE`)이 난다. 반환 문자열은 들여쓰기 3칸.
 */
export function curlFallback(
  origin: string,
  code: string,
  calls: { url: string; body: string; note?: string }[],
): string {
  const base = origin.replace(/\/$/, "");
  const lines = [
    `   curl -X POST ${base}/api/connect/exchange \\`,
    `     -H "Content-Type: application/json" \\`,
    `     -d '{"code": "${code}"}'`,
    `  That prints {"token": "nf_live_…"}. Use THAT token — not the code — for the next call${calls.length > 1 ? "s" : ""}:`,
  ];
  for (const c of calls) {
    if (c.note) lines.push(`  ${c.note}`);
    lines.push(
      `   curl -X POST "${c.url}" \\`,
      `     -H "Authorization: Bearer <the token it just printed>" \\`,
      `     -H "Content-Type: application/json" \\`,
      `     ${c.body}`,
    );
  }
  lines.push("  Only trade the code if you did NOT run the login command — that already spent it; reuse the token it saved instead.");
  return lines.join("\n");
}

// MCP 연결(2026-09-04, 인터뷰 ⑦ 터미널 쪽). 프롬프트 붙여넣기·JSON 옮기기가 통째로
// 사라지는 길이라 연결 탭에 같이 둔다. 토큰 이름은 자동 토큰처럼 센티널 —
// 서버가 재복사 때 이전 것을 폐기해 토큰 상한(MAX_TOKENS_PER_USER)에 안 걸린다.
/**
 * 원격 MCP 커넥터 주소(2026-09-17). 이것만 붙이면 끝이라 **토큰을 만들지 않는다** —
 * 인증은 Claude가 띄우는 [허용] 화면에서 OAuth로 일어난다. 아래 stdio 방식(npx+토큰)과
 * 헷갈리지 말 것: 이 길은 설치도, 설정 파일 편집도, 토큰 복사도 없다.
 */
export function remoteMcpUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

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
  // 작품 두 언어(2026-09-29): 기본 언어 = 화면 언어, 다른 언어 판은 translation에 한 벌 더.
  if (locale === "en") {
    return 'LANGUAGE — write every human-readable string you produce (title, description, builderNote, notes) in English, and set "language": "en". Nookframe also shows every work in Korean, so put the same title/description/builderNote in natural Korean in "translation".';
  }
  return 'LANGUAGE — this owner\'s page is Korean, so write every human-readable string you produce (title, description, builderNote, notes) in KOREAN, and set "language": "ko". Nookframe also shows every work in English, so put the same title/description/builderNote in natural English in "translation". Do NOT translate JSON keys, enum values (contentType, targetDevice, action names) or tag spellings — those stay exactly as written below.';
}

// 2026-09-15 외부 AI 업로드 피드백으로 사실과 어긋나거나 위험한 문장을 바로잡았다:
// 첫 줄=초안이라는 사실, /demo 추가는 주인에게 먼저 묻기, 공개 영상엔 가짜 데이터,
// 로봇 화면 1280×720(local-runner/config.ts), 저장 요청은 건너뛰거나 가짜 성공
// (explore 하드룰·local-runner/safety.ts), 소개글 한 줄 거절선 52칸(lib/descriptionShape.ts).
export function pastePrompt(
  origin: string,
  locale: "ko" | "en" = "ko",
  code?: string,
): string {
  const login = loginCommand(code ?? CONNECT_CODE_PLACEHOLDER);
  return `Upload this project to Nookframe (a vibe-coding portfolio) as a DRAFT — only the owner can make it public.

${outputLanguageLine(locale)}

You're the AI that built this project, so read the repo yourself and describe it on my behalf:
1) If you have a shell, first run this once to pair with my account (skip if you have no shell):
   ${login}
   That argument is a ONE-TIME pairing code, not a token: the command trades it at the server for the real token and saves that on this machine. It works once and dies 30 minutes after I copied this prompt, so putting it in an Authorization header will fail — if it's already used or expired, ask me to press "Copy prompt" again for a fresh one.
   If you have a shell but npx won't run (no Node.js, or the npm registry is blocked), don't stop and don't ask me to install anything — skip this command and use the plain-HTTP route in step 6 instead.
2) First, look around the project — README, package.json, the actual routes/screens, git log — just enough to know what it is, what already works, and whether there is anything a visitor could see (a screen, an output, a terminal run). Don't change anything yet. If it's still half-built, also work out what it was going to be.
3) Then interview me — this is required: the server rejects an upload without it. Ask in this chat, in plain everyday words, in the language I write to you in, and WAIT for my answers — never answer for me. Fit the questions to what you found in step 2:
   a. Which part of this app do you most want people to see — a screen, a feature, a result? (Ask about a PART of the app, not a moment in my life.)
   b. How do you use it — when, how often, what for? If I haven't really used it yet, ask what I built it for instead.
   c. What's the one thing a first-time viewer must notice?
   d. (optional) Is there anything that must never be shown — people's names, amounts, places, health details?
   e. Only if the app's own screens have no English (you checked in step 2 — a language switch, i18n files): "Should I add an English version of the app?" Nookframe shows every work to English-speaking visitors too. It means changing and redeploying my app, so it's my call: yes → add English, deploy it (tell me what you changed), and list both in appLanguages; no → give every demoScript step an English caption instead. If only Korean is missing, don't ask — just write Korean captions.
   If the project is still half-built or has nothing to see yet (a backend with no screen, a tool that has never produced output), say so first in one or two plain sentences, then ask whether I want to upload it now as a work in progress or wait until there is something to show — and fit a–c to that (what it will do, what works so far).
   Keep this message to these questions. Don't put filming mechanics in it — no talk of robots, repos, logs, selectors or test data. If filming later needs something from me (a demo mode, sample data, my own video), ask that separately after I answer: one plain sentence saying what you'd do and why, and a yes/no.
   A demo is not the real app, and only I know what matters. My answers go into ownerInterview (step 4) and shape the rest: open or linger on (a) and (c) in the demoScript, draw builderNote from (b), and leave any screen that shows (d) out of the script.
4) Build a publish payload (JSON) with these fields (${NPX_SCHEMA} prints the same list as a JSON Schema, if you want it machine-readable):
   • ownerInterview — REQUIRED: { "proudMoment": "…", "howIUse": "…", "mustSee": "…", "hide": ["…"] } — my answers from step 3 in my own words (max 300 characters each; placeholders like "none" or "N/A" are rejected). They are not printed on the public page, and hide stays private
   • language — REQUIRED: "ko" or "en", the language you wrote title/description/builderNote in (see LANGUAGE above)
   • translation — REQUIRED: { "title": "…", "description": "line 1\\nline 2\\nline 3", "builderNote": "…" } — the same copy in the OTHER language, written the way a native speaker would (not word for word). Same 2–3 line rule for the description
   • appLanguages — REQUIRED: which of "ko"/"en" the app's own screens can show, e.g. ["ko"], ["ko","en"], or [] — from the code, after step 3e. The robot films once per language listed; a language the app can't show gets captions instead (see caption under demoScript)
   • title — a short, clear product name
   • description — the intro that sits ON TOP of the work on your public card, so first impressions live or die here. Do NOT write a paragraph. Write THREE short lines separated by newlines (\\n), where the first two modify and the last one names what it is:
       For people who create with AI
       with demo videos recorded automatically
       a live portfolio you can actually touch
     Keep each line short (~20 CJK / ~40 Latin characters) so it doesn't wrap on a phone. Only 3 lines show on the card. A single paragraph is rejected (it must be 2–3 lines), and so is any line over 52 columns (a CJK character counts as 2) or anything over 200 characters
   • builderNote — (optional) a short one-liner shown as a speech bubble on the public card, drawn from my answer (b) in my voice. One line, not a paragraph — e.g. "I check it every Monday morning"
   • demoScript — **REQUIRED** (the one exception: attaching your own demo "video", which skips auto-recording). A publish without it is rejected with an error telling you to write one. The filming script the auto-demo robot follows. You BUILT this app, so you know which screen shows what and which control proves the core value — don't make the robot guess from pixels. Shape:
       { "steps": [ { "goal": "what this beat proves", "selector": "the control's CSS selector — you know the code, give the exact one", "where": "how to FIND it by eye (visible label/position) — the fallback when a selector misses", "action": "click|type|drag|scroll|hover|draw|focus|navigate|wait", "toSelector": "(drag only) CSS selector of the drop target", "text": "what to type (type only)", "expect": "what the screen should show right after", "hold": 2 } ],
         "skip": ["things NOT worth a beat because every app has them — e.g. a dark-mode or language toggle"],
         "prep": "one optional setup line before the tour" }
     Your script IS the film — the robot shoots exactly these steps and stops, so cover every feature worth showing: 5–8 steps is the sweet spot (min 4, max 10). Order = importance; the film is ~30s and gets cut from the END, so step 1 is the one feature the demo must not miss. "hold" (seconds, 0.5–4) keeps that step's result on screen longer — use it on beats that deserve a pause. Every step needs BOTH an action and a selector (or where, if you only know the UI) — a step with just a goal is a table of contents, not a script, and a script made of those is rejected (at least 3 steps must meet this bar). The robot verifies each step on the live screen and skips what it can't find. It has no account (it can't log in) and never opens file pickers; clicks that save, send or delete are skipped or answered with a fake success, so nothing reaches your real server — typing into a form to show it off is fine, but don't build a beat on a result only your server can produce (an AI reply, data reloaded from the database). SELECTORS MATTER MOST: when EVERY step carries a selector (and drags carry toSelector), the robot skips the vision pass entirely and assembles the film straight from the DOM — faster, cheaper, and pixel-exact framing. You built this app, so give real selectors for every step; if any selector fails on the live page the robot falls back to reading the screen. action "focus" is the emphasis device: the film's camera MAGNIFIES that area for the beat (nothing is clicked) — use it for "let the viewer study this" moments like a playing video or a result panel. action "navigate" with "to": "back" returns to the PREVIOUS screen through browser history — use it instead of spending a beat clicking the app's own back button, and give it no selector (it needs none). action "wait" is for a SLOW app: right after a step whose result takes a moment to appear (an AI answer, a chart that computes, a heavy first load), add a wait step with the selector of what should appear — the robot waits up to 10 seconds for it before moving on, so the film catches the result instead of an empty screen (without a selector it just pauses for "hold" seconds, default 2). CAPTIONS: for each of ko/en that appLanguages does NOT list, every step (except navigate and wait) needs "caption": { "<that language>": "…" } — one short line (max 90 characters) saying what the scene shows, drawn from my interview answers. Visitors in that language see it laid over the video until the next caption
   • tags — which AI tools were used to build this. Pick from this exact list (anything else is silently dropped): ChatGPT, Claude Code, Cursor, GitHub Copilot, Gemini, v0, Bolt.new, Windsurf, Lovable, Replit AI, Devin, Aider, Continue.dev, Codeium, Amazon Q, Perplexity, Midjourney, DALL-E, Stable Diffusion, Ideogram, Flux, Runway, Kling, Pika, Suno, ElevenLabs
   • contentType — one of web-app | saas | mobile | game | extension | ai-service | media | other
   • targetDevice — REQUIRED: "mobile" or "desktop", the screen this app was mainly designed for. "mobile" = built for phone screens (a narrow single column, a bottom tab bar, touch-first); "desktop" = built for a computer browser (wide layouts, sidebars, hover). If it works on both, pick the one it was designed for first. This is NOT contentType — a phone-first web app is contentType "web-app" with targetDevice "mobile". The owner's draft preview is framed as a phone or a desktop screen from this answer, and a publish without it is rejected. The demo robot itself always films a 1280×720 desktop browser, so write demoScript selectors for what the app shows at that size (a bottom tab bar that only appears on phones won't be there)
   • deployUrl — the deployed public URL (vercel/netlify, etc.). If you are a CHAT assistant with no shell and you built this as a preview panel inside the chat (a Claude artifact, a Qwen Web Dev page, a Bolt/Lovable/Replit project), what to give depends on the tool. A tool that deploys to a real address (Qwen Web Dev, Bolt, Lovable, Replit) is fine — publish it and give that address here. A Claude artifact share link is NOT: those pages sit behind a bot check the demo robot cannot pass. That is not a login — a person gets through and a robot does not — so do NOT ask the owner to change their sharing settings. Put the artifact's whole HTML in the payload's htmlBody field instead — a complete document from <!doctype html> through </html> with the CSS and JS inlined, which the server stores as index.html and films like any static site. Do not send a document that got cut off mid-answer: continue it first, then send the whole thing (the server rejects a truncated one). Only if it is too big (over 2MB) or has separate CSS/JS/asset files, ask the owner to attach it as a zip at ${origin}/publish. Ask the owner to press publish/deploy in their chat tool if you cannot. One exception: a Claude artifact that calls Claude's API at runtime still asks visitors to sign in, so the robot cannot film it — answer demoAccess with "impossible" and attach your own video instead. If it isn't deployed: prefer a file upload first — a static build output for web apps, or the source folder as-is for Python/CLI projects (no need to make the code public). If that won't work (the app needs a server/database), you can instead give the public GitHub repo URL — it's a last resort that clones and runs the app automatically: JS repos via npm run dev/start, Python web apps (Streamlit/Gradio/Dash/Django/Flask/FastAPI) via pip install + the framework's own launcher (Django also gets migrate run for you), PHONE APPS built with Flutter, Expo or React Native by compiling their web target (flutter build web / expo export --platform web) and filming the real running app in a browser — so send the source, not screenshots, and a project with no web screen at all (a CLI tool, a bot, a backend) gets filmed as a live terminal where the demo robot types its commands — a demoScript with the exact commands to type makes that film dramatically better (fails on private repos; apps using a remote database get demoted to a read-only demo). A NATIVE phone or desktop app with no web target at all (Swift/SwiftUI, Kotlin/Jetpack Compose, Electron-only, Unity) cannot be filmed by the robot — attach your own demo \"video\" for those, which skips auto-recording entirely
   • appUrl — if the landing page and the actual app live at different URLs (e.g. / is the intro, /app is the real app), the app URL the demo/embed should open. Give BOTH appUrl and deployUrl when they differ and you aren't sure which one shows more — right before filming, the demo robot loads each and picks whichever screen actually shows the product (an app URL that's blank until you log in loses to a real landing page). appUrl is what the demo films and what the card's open-link points to, either way
   • demoAccess — REQUIRED, and the answer decides whether this film shows anything at all. The demo robot NEVER logs in. So do not only ask "is the screen visible without login?" — ask "does anything actually WORK before logging in?". Most apps look fine logged-out and then do nothing: the list is empty, saving bounces to a sign-in page, the dashboard is a shell. That is the single most common way a demo comes out worthless, and it is not detected as a failure, because a screen did appear. Answer with exactly ONE of these three:
     – there is a way in without logging in → { "url": "/demo", "params": {"guest":"1"}, "note": "how to reach demo mode from there" }. Look hard before giving up: a demo/guest/preview route, a seeded read-only account behind a magic-link path, a ?demo=1 flag, a public sample project URL. If none exists, a small "/demo" mode that fills the app with FAKE data is usually the highest-value fix for this film — but that means changing and redeploying the owner's app, so ASK the owner before writing that code or deploying anything, and never let it expose or change real accounts
     – login genuinely isn't needed AND every feature works from the first screen → { "noLogin": true, "note": "one line of evidence — e.g. no auth guard in middleware or the first screen; the list renders from seed data" }. Only claim this after opening the actual routes/guards, not from the landing page looking nice — a bare noLogin with no note is rejected
     – a guest path is fundamentally impossible (E2E-encrypted, device pairing, real payments) → { "impossible": true, "note": "why" } (rejected without the note). Only the landing page gets filmed, so attach your own "video" as well
     NEVER include account IDs or passwords — they are not accepted, and publishing is rejected without one of the three answers above. The film and the card are PUBLIC, so every screen the robot opens must show fake or sample data — never real people's names, emails, messages, health or payment records
5) If you have a shell: before uploading anything, write the JSON above to a file and run ${NPX_CHECK} --file <that file>. That asks the server the exact questions publishing would ask — the script, the description shape, targetDevice, demoAccess, the owner interview, the two languages and captions, the estimated film length — and prints either the precise rejection reason or a summary of what would be accepted. Nothing is stored and nothing is uploaded. If it rejects, fix the JSON and check again until it passes; reading the reason here is far cheaper than publishing and getting a 400.
6) If you have a shell: publish it — ${NPX_PUBLISH} --file <that file> (step 1 already paired this machine). Then tell the owner it went up as a DRAFT — nothing is public until they open the review link it prints and press publish.
   If you have a screenshot or a demo video you made, add --screenshot <path> / --video <path> (image png/jpg/webp/gif ≤5MB; video mp4/webm ≤20MB — providing a video replaces the auto-recorded demo).
   If you have a shell but no npx (see step 1): plain HTTP does the same check and publish for a deployUrl or htmlBody payload, but it takes TWO steps — the pairing code from step 1 cannot go in an Authorization header, so trade it for a token first:
${curlFallback(origin, code ?? CONNECT_CODE_PLACEHOLDER, [
    { url: `${origin}/api/ingest?dryRun=1`, body: "--data @<that file>", note: "Check first (same as step 5 — stores nothing):" },
    { url: `${origin}/api/ingest`, body: "--data @<that file>", note: "Then publish (it answers with the draft id and the review link to give me):" },
  ])}
   A folder or zip upload needs the CLI; over plain HTTP send a deployUrl or htmlBody instead (screenshots and your own video are CLI-only too).
   If you don't have a shell: print the JSON in one \`\`\`json code block, then put this link on its own line right after it so I can click straight through: ${origin}/publish — I'll paste the JSON there.
   To revise something already pushed, publish again with --id <the draft id it printed> — that draft is updated in place, no duplicates.`;
}
