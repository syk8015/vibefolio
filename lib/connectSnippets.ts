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
export const MCP_TOKEN_PLACEHOLDER = "<복사 버튼을 누르면 새 토큰이 여기 자동으로 채워져요>";

export function mcpClaudeCodeCommand(token: string = MCP_TOKEN_PLACEHOLDER): string {
  return `claude mcp add nookframe -e NOOKFRAME_TOKEN=${token} -- npx -y nookframe mcp`;
}

export function mcpConfigJson(token: string = MCP_TOKEN_PLACEHOLDER): string {
  return JSON.stringify(
    { mcpServers: { nookframe: { command: "npx", args: ["-y", "nookframe", "mcp"], env: { NOOKFRAME_TOKEN: token } } } },
    null, 2,
  );
}

export function pastePrompt(
  origin: string,
  locale: "ko" | "en" = "ko",
  token?: string,
): string {
  const tokenArg =
    token ??
    (locale === "en"
      ? "<a fresh token is filled in here when you press copy>"
      : "<복사 버튼을 누르면 새 토큰이 여기 자동으로 채워져요>");
  const login = loginCommand(tokenArg);
  if (locale === "en") {
    return `Publish this project to Nookframe (a vibe-coding portfolio).

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
  return `이 프로젝트를 Nookframe(바이브코딩 포트폴리오)에 올려줘.

너가 이 프로젝트를 만든 AI니까, 레포를 직접 읽고 나 대신 설명해줘:
1) 셸을 쓸 수 있으면, 먼저 아래를 한 번 실행해 내 연결 토큰을 저장해 (셸이 없으면 건너뛰어):
   ${login}
2) README·package.json·실제 라우트/화면·git log를 근거로 조사해. 아직 만들다 만 거면 "무엇을 만들려던 건지"도 파악해.
3) 아래 항목을 채운 publish 페이로드(JSON)를 만들어:
   • title — 짧고 명확한 제품 이름
   • description — 명함 화면에서 작품 위에 겹쳐 뜨는 소개글이라 첫인상이 여기서 갈려. 한 문단으로 쓰지 말고, 줄바꿈(\\n)으로 끊은 3줄로 써. 앞 두 줄이 수식하고 마지막 줄이 정체를 밝히는 구조:
       AI로 창작하는 사람들을 위한
       자동으로 시연 영상까지 만들어주는
       직접 보고 느끼는 라이브 포트폴리오
     각 줄은 20자 안팎으로 짧게(폰에서 줄이 접히면 마지막 줄이 잘려). 명함에는 3줄까지만 보여. 한 문단으로 붙여 쓰거나 한 줄이 너무 길면 발행이 거절되고(2~3줄이어야 함), 200자를 넘어도 안 받아
   • builderNote — (선택) 공개 카드에 말풍선으로 뜨는 짧은 한마디. 문단이 아니라 한 줄, 예: "이게 제 첫 사이드프로젝트예요!"
   • demoScript — **필수** (유일한 예외: 직접 만든 시연 영상 "video"를 첨부하면 자동 촬영을 건너뛰므로 면제). 없이 발행하면 "대본을 써서 다시 보내라"는 에러로 거절된다. 자동 시연 로봇이 따라 찍는 촬영 대본. 이 앱은 네가 만들었으니 어떤 화면에서 뭘 눌러야 핵심이 보이는지 안다 — 로봇이 픽셀만 보고 추측하게 두지 마. 형식:
       { "steps": [ { "goal": "이 비트가 증명하는 것", "selector": "그 컨트롤의 CSS 셀렉터 — 코드를 아는 네가 정확한 걸 줄 수 있다", "where": "눈으로 찾는 법(보이는 라벨·위치) — 셀렉터가 빗나갔을 때의 폴백", "action": "click|type|drag|scroll|hover|draw|focus", "toSelector": "(drag 전용) 놓을 곳의 CSS 셀렉터", "text": "type일 때 입력할 내용", "expect": "하고 나면 화면에 나타나야 하는 것", "hold": 2 } ],
         "skip": ["모든 앱에 다 있어서 비트가 아까운 것들 — 예: 다크 모드·언어 토글"],
         "prep": "(선택) 투어 전 준비 한 줄" }
     이 대본이 곧 영상 전체다 — 로봇은 딱 이 스텝들만 찍고 끝내니, 보여줄 가치가 있는 기능을 빠짐없이 담아라: 5~8스텝이 적정(최소 4, 최대 10). 순서=중요도이고 필름은 ~30초라 뒤부터 잘리니 1번이 "절대 빠지면 안 되는 기능". "hold"(초, 0.5~4)를 주면 그 스텝의 결과를 그만큼 오래 보여준다 — 천천히 봐야 하는 비트에 써라. 스텝마다 action과 selector(코드를 모르면 where)를 반드시 같이 넣어라 — goal만 적힌 줄은 대본이 아니라 목차라서, 그런 스텝뿐이면 발행이 거절돼(최소 3스텝이 이 조건을 채워야 함). 로봇은 각 스텝을 실제 화면에서 확인하고 못 찾으면 건너뛰며, 대본에 있어도 로그인/제출/삭제/파일선택은 절대 안 누른다. 가장 중요한 건 셀렉터다: 모든 스텝에 selector가 있으면(드래그는 toSelector까지) 로봇이 화면을 읽는 비전 단계를 통째로 건너뛰고 DOM에서 직접 조립한다 — 더 빠르고, 더 싸고, 프레이밍이 픽셀 단위로 정확해진다. 이 앱은 네가 만들었으니 전 스텝에 진짜 셀렉터를 줘라. 라이브 화면에서 셀렉터가 하나라도 빗나가면 로봇이 화면을 눈으로 읽는 방식으로 폴백한다. action "focus"는 강조 장치다: 그 영역을 조작하지 않고 필름 카메라가 확대해서 보여준다 — 재생 중인 영상·결과 패널처럼 "여길 자세히 봐야 한다"는 비트에 써라
   • tags — 이 작업에 쓴 AI 툴. 아래 목록에서 철자 그대로 골라줘(다른 이름은 조용히 버려짐): ChatGPT, Claude Code, Cursor, GitHub Copilot, Gemini, v0, Bolt.new, Windsurf, Lovable, Replit AI, Devin, Aider, Continue.dev, Codeium, Amazon Q, Perplexity, Midjourney, DALL-E, Stable Diffusion, Ideogram, Flux, Runway, Kling, Pika, Suno, ElevenLabs
   • contentType — web-app | saas | mobile | game | extension | ai-service | media | other 중 하나
   • deployUrl — 배포된 공개 URL (vercel/netlify 등). 미배포면: 우선 파일 업로드를 써 — 웹앱은 정적 빌드 산출물, 파이썬·CLI 프로젝트는 소스 폴더 그대로 올리면 돼(코드를 공개하지 않아도 됨). 그걸로 안 되는 앱(서버·DB 필요)이면 공개 GitHub 저장소 URL을 대신 줘도 돼 — clone 후 자동 실행하는 최후 수단이야(JS 리포는 npm run dev/start, 파이썬 웹앱은 Streamlit·Gradio·Dash·Django·Flask·FastAPI를 감지해 pip install 후 실행(Django는 migrate도 대신 돌려줌). Flutter·Expo·React Native로 만든 폰 앱은 웹 타깃을 대신 빌드해(flutter build web / expo export --platform web) 브라우저에서 진짜로 도는 앱을 촬영해 — 스크린샷 말고 소스를 줘. 웹 화면이 아예 없는 프로젝트(CLI 도구·봇·백엔드)는 라이브 터미널을 띄워 로봇이 명령어를 쳐 보는 영상으로 촬영돼 — 이 경우 demoScript에 정확한 명령어를 적어주면 영상이 훨씬 좋아져. 비공개 저장소는 실패, 원격 DB 쓰는 앱은 읽기전용 데모로 나옴). 웹 타깃이 아예 없는 네이티브 앱(Swift·SwiftUI, Kotlin·Compose, Electron 전용, Unity)은 로봇이 못 찍어 — 이런 건 직접 만든 시연 영상(\"video\")을 첨부해(자동 촬영을 건너뜀)
   • appUrl — 랜딩과 실제 앱 화면 주소가 다르면(예: / 는 소개, /app 이 진짜 앱), 시연·임베드가 열어야 할 앱 URL. 둘 중 뭘 찍어야 할지 확실하지 않으면 appUrl과 deployUrl을 둘 다 줘 — 촬영 직전에 로봇이 두 화면을 각각 열어보고 실제로 제품이 보이는 쪽을 고른다(로그인 전엔 비어 있는 앱 화면은 제대로 된 랜딩에 진다). 시연 촬영과 명함의 [작품 열기] 링크는 어느 쪽이든 appUrl을 쓴다
   • demoAccess — 필수야. 이 답 하나가 영상에 뭐라도 담기는지를 결정해. 시연 로봇은 절대 로그인하지 않아. 그러니 "로그인 안 해도 화면이 보이나?"만 묻지 말고 "로그인 전에 뭐가 실제로 **작동하나**?"를 물어봐. 대부분의 앱은 로그아웃 상태에서 멀쩡해 보이지만 아무 일도 안 일어나: 목록이 비어 있고, 저장을 누르면 로그인 페이지로 튕기고, 대시보드는 껍데기야. 시연이 쓸모없어지는 가장 흔한 경로가 정확히 이거고, 화면은 떴으니 실패로 잡히지도 않아. 아래 셋 중 **딱 하나**로 답해:
     – 로그인 없이 들어갈 길이 있으면 → { "url": "/demo", "params": {"guest":"1"}, "note": "거기서 데모 모드를 보는 법" }. 포기하기 전에 제대로 찾아봐: 데모·게스트·프리뷰 라우트, 매직링크 경로 뒤의 읽기전용 시드 계정, ?demo=1 플래그, 공개 샘플 프로젝트 URL. 정말 없으면 지금 하나 만드는 게 이 영상을 위해 할 수 있는 가장 값진 일이야 — 가짜 데이터를 심고 인증을 건너뛰는 작은 "/demo" 라우트는 보통 몇 줄이면 돼
     – 로그인이 정말 아예 필요 없고 첫 화면부터 전 기능이 눌리면 → { "noLogin": true, "note": "확인한 근거 한 줄 — 예: middleware·첫 화면에 인증 가드 없음, 목록은 시드 데이터로 채워짐" }. 랜딩이 멀쩡해 보인다고 쓰지 말고 실제 라우트·가드를 열어 확인한 뒤에만 선언해 — note 없이 noLogin만 보내면 거절돼
     – 게스트 경로가 원천 불가능하면(E2E 암호화·기기 페어링·실결제 등) → { "impossible": true, "note": "이유" }(note 없으면 거절). 이러면 랜딩만 찍히니 직접 만든 "video"도 같이 첨부해
     계정 아이디·비번은 절대 넣지 마 — 받지 않아. 위 셋 중 하나가 없으면 발행 자체가 거절돼
4) 셸을 쓸 수 있으면: ${NPX_PUBLISH} --json '<위 JSON>' 을 실행해 (토큰은 1)에서 저장했어).
   직접 찍은 스크린샷·시연 영상 파일이 있으면 --screenshot <경로> / --video <경로> 를 붙여 (이미지 png/jpg/webp/gif ≤5MB, 영상 mp4/webm ≤20MB — 영상을 주면 자동 촬영 대신 그 영상이 쓰여).
   셸이 없으면: 위 JSON을 \`\`\`json 코드블록 하나로 출력하고, 바로 다음 줄에 이 링크를 그대로 적어줘(내가 눌러서 바로 가게): ${origin}/publish — 거기에 붙여넣을게.
   이미 올린 걸 고치고 싶으면 같은 URL로 publish를 다시 실행해 — 새 초안이 생기지 않고 기존 초안이 갱신돼.`;
}
