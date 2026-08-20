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
     Keep each line short (~20 CJK / ~40 Latin characters) so it doesn't wrap on a phone. Only 3 lines show on the card; over 200 characters is rejected
   • builderNote — (optional) a short one-liner shown as a speech bubble on the public card. One line, not a paragraph — e.g. "This is my first side project!"
   • demoScript — the filming script the auto-demo robot follows. You BUILT this app, so you know which screen shows what and which control proves the core value — don't make the robot guess from pixels. Shape:
       { "steps": [ { "goal": "what this beat proves", "where": "how to FIND the control on screen — its visible label/position, NOT a CSS selector", "action": "click|type|drag|scroll|hover|draw|focus", "text": "what to type (type only)", "expect": "what the screen should show right after", "hold": 2 } ],
         "skip": ["things NOT worth a beat because every app has them — e.g. a dark-mode or language toggle"],
         "prep": "one optional setup line before the tour" }
     Your script IS the film — the robot shoots exactly these steps and stops, so cover every feature worth showing: 5–8 steps is the sweet spot (max 10). Order = importance; the film is ~30s and gets cut from the END, so step 1 is the one feature the demo must not miss. "hold" (seconds, 0.5–4) keeps that step's result on screen longer — use it on beats that deserve a pause. The robot verifies each step on the live screen and skips what it can't find; it never logs in, submits, deletes, or opens file pickers even if a step asks. action "focus" is the emphasis device: the film's camera MAGNIFIES that area for the beat (nothing is clicked) — use it for "let the viewer study this" moments like a playing video or a result panel
   • tags — which AI tools were used to build this. Pick from this exact list (anything else is silently dropped): ChatGPT, Claude Code, Cursor, GitHub Copilot, Gemini, v0, Bolt.new, Windsurf, Lovable, Replit AI, Devin, Aider, Continue.dev, Codeium, Amazon Q, Perplexity, Midjourney, DALL-E, Stable Diffusion, Ideogram, Flux, Runway, Kling, Pika, Suno, ElevenLabs
   • contentType — one of web-app | saas | mobile | game | extension | ai-service | media | other
   • deployUrl — the deployed public URL (vercel/netlify, etc.). If it isn't deployed: prefer a file upload first — a static build output for web apps, or the source folder as-is for Python/CLI projects (no need to make the code public). If that won't work (the app needs a server/database), you can instead give the public GitHub repo URL — it's a last resort that clones and runs the app automatically: JS repos via npm run dev/start, Python web apps (Streamlit/Gradio/Flask/FastAPI/Dash) via pip install + the framework's own launcher, and a project with no web screen at all (a CLI tool, a bot, a backend) gets filmed as a live terminal where the demo robot types its commands — a demoScript with the exact commands to type makes that film dramatically better (fails on private repos; apps using a remote database get demoted to a read-only demo)
   • appUrl — if the landing page and the actual app live at different URLs (e.g. / is the intro, /app is the real app), the app URL the demo/embed should open. Give BOTH appUrl and deployUrl when they differ and you aren't sure which one shows more — right before filming, the demo robot loads each and picks whichever screen actually shows the product (an app URL that's blank until you log in loses to a real landing page). appUrl is what the demo films and what the card's open-link points to, either way
   • demoAccess — if the app needs login to see anything, give the demo robot a way in that works WITHOUT logging in: { url (a demo/guest entry URL or path, e.g. "/demo"), params (extra query params, e.g. {"guest":"1"}), note (1–2 sentences on how to see the demo mode from there) }. NEVER include account IDs or passwords — they are not accepted. If a guest path is fundamentally impossible (E2E-encrypted, device-pairing-only, etc.), send { impossible: true, note: "why" } instead — the auto-demo will then only film the landing page, so attaching your own video/screenshot is strongly recommended
4) If you have a shell: run ${NPX_PUBLISH} --json '<the JSON above>' (the token was saved in step 1).
   If you have a screenshot or a demo video you made, add --screenshot <path> / --video <path> (image png/jpg/webp/gif ≤5MB; video mp4/webm ≤20MB — providing a video replaces the auto-recorded demo).
   If you don't have a shell: just print the JSON — I'll paste it into ${origin}/publish.
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
     각 줄은 20자 안팎으로 짧게(폰에서 줄이 접히면 마지막 줄이 잘려). 명함에는 3줄까지만 보이고, 200자를 넘으면 아예 안 받아
   • builderNote — (선택) 공개 카드에 말풍선으로 뜨는 짧은 한마디. 문단이 아니라 한 줄, 예: "이게 제 첫 사이드프로젝트예요!"
   • demoScript — 자동 시연 로봇이 따라 찍는 촬영 대본. 이 앱은 네가 만들었으니 어떤 화면에서 뭘 눌러야 핵심이 보이는지 안다 — 로봇이 픽셀만 보고 추측하게 두지 마. 형식:
       { "steps": [ { "goal": "이 비트가 증명하는 것", "where": "화면에서 그 컨트롤을 찾는 법 — CSS 셀렉터가 아니라 보이는 라벨·위치", "action": "click|type|drag|scroll|hover|draw|focus", "text": "type일 때 입력할 내용", "expect": "하고 나면 화면에 나타나야 하는 것", "hold": 2 } ],
         "skip": ["모든 앱에 다 있어서 비트가 아까운 것들 — 예: 다크 모드·언어 토글"],
         "prep": "(선택) 투어 전 준비 한 줄" }
     이 대본이 곧 영상 전체다 — 로봇은 딱 이 스텝들만 찍고 끝내니, 보여줄 가치가 있는 기능을 빠짐없이 담아라: 5~8스텝이 적정(최대 10). 순서=중요도이고 필름은 ~30초라 뒤부터 잘리니 1번이 "절대 빠지면 안 되는 기능". "hold"(초, 0.5~4)를 주면 그 스텝의 결과를 그만큼 오래 보여준다 — 천천히 봐야 하는 비트에 써라. 로봇은 각 스텝을 실제 화면에서 확인하고 못 찾으면 건너뛰며, 대본에 있어도 로그인/제출/삭제/파일선택은 절대 안 누른다. action "focus"는 강조 장치다: 그 영역을 조작하지 않고 필름 카메라가 확대해서 보여준다 — 재생 중인 영상·결과 패널처럼 "여길 자세히 봐야 한다"는 비트에 써라
   • tags — 이 작업에 쓴 AI 툴. 아래 목록에서 철자 그대로 골라줘(다른 이름은 조용히 버려짐): ChatGPT, Claude Code, Cursor, GitHub Copilot, Gemini, v0, Bolt.new, Windsurf, Lovable, Replit AI, Devin, Aider, Continue.dev, Codeium, Amazon Q, Perplexity, Midjourney, DALL-E, Stable Diffusion, Ideogram, Flux, Runway, Kling, Pika, Suno, ElevenLabs
   • contentType — web-app | saas | mobile | game | extension | ai-service | media | other 중 하나
   • deployUrl — 배포된 공개 URL (vercel/netlify 등). 미배포면: 우선 파일 업로드를 써 — 웹앱은 정적 빌드 산출물, 파이썬·CLI 프로젝트는 소스 폴더 그대로 올리면 돼(코드를 공개하지 않아도 됨). 그걸로 안 되는 앱(서버·DB 필요)이면 공개 GitHub 저장소 URL을 대신 줘도 돼 — clone 후 자동 실행하는 최후 수단이야(JS 리포는 npm run dev/start, 파이썬 웹앱은 Streamlit·Gradio·Flask·FastAPI·Dash를 감지해 pip install 후 실행. 웹 화면이 아예 없는 프로젝트(CLI 도구·봇·백엔드)는 라이브 터미널을 띄워 로봇이 명령어를 쳐 보는 영상으로 촬영돼 — 이 경우 demoScript에 정확한 명령어를 적어주면 영상이 훨씬 좋아져. 비공개 저장소는 실패, 원격 DB 쓰는 앱은 읽기전용 데모로 나옴)
   • appUrl — 랜딩과 실제 앱 화면 주소가 다르면(예: / 는 소개, /app 이 진짜 앱), 시연·임베드가 열어야 할 앱 URL. 둘 중 뭘 찍어야 할지 확실하지 않으면 appUrl과 deployUrl을 둘 다 줘 — 촬영 직전에 로봇이 두 화면을 각각 열어보고 실제로 제품이 보이는 쪽을 고른다(로그인 전엔 비어 있는 앱 화면은 제대로 된 랜딩에 진다). 시연 촬영과 명함의 [작품 열기] 링크는 어느 쪽이든 appUrl을 쓴다
   • demoAccess — 로그인해야 화면이 보이는 앱이면, 시연 로봇이 로그인 없이 들어갈 길을 줘: { url(데모/게스트 진입 URL이나 경로, 예 "/demo"), params(추가 쿼리 파라미터, 예 {"guest":"1"}), note(거기서 데모 모드를 보는 법 한두 문장) }. 계정 아이디/비번은 절대 넣지 마 — 받지 않아. 게스트 경로 자체가 원천 불가능한 앱(E2E 암호화·기기 페어링 필수 등)이면 대신 { impossible: true, note: "이유" }를 줘 — 그럼 자동 촬영은 랜딩만 담으니 직접 만든 영상·스크린샷 동봉을 강하게 권장해
4) 셸을 쓸 수 있으면: ${NPX_PUBLISH} --json '<위 JSON>' 을 실행해 (토큰은 1)에서 저장했어).
   직접 찍은 스크린샷·시연 영상 파일이 있으면 --screenshot <경로> / --video <경로> 를 붙여 (이미지 png/jpg/webp/gif ≤5MB, 영상 mp4/webm ≤20MB — 영상을 주면 자동 촬영 대신 그 영상이 쓰여).
   셸이 없으면: 위 JSON만 출력해 — 내가 ${origin}/publish 에 붙여넣을게.
   이미 올린 걸 고치고 싶으면 같은 URL로 publish를 다시 실행해 — 새 초안이 생기지 않고 기존 초안이 갱신돼.`;
}
