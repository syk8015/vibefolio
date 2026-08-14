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
   • description — one paragraph: what it is and who it's useful for (if unfinished, include where it's headed)
   • builderNote — (optional) a short one-liner shown as a speech bubble on the public card. One line, not a paragraph — e.g. "This is my first side project!"
   • demoHighlights — 3–5 key things the auto-demo video must show, written descriptively. Not instructions like "click X" — more like "the X feature is the heart of this product". Under 500 characters
   • tags — which AI tools were used to build this. Pick from this exact list (anything else is silently dropped): ChatGPT, Claude Code, Cursor, GitHub Copilot, Gemini, v0, Bolt.new, Windsurf, Lovable, Replit AI, Devin, Aider, Continue.dev, Codeium, Amazon Q, Perplexity, Midjourney, DALL-E, Stable Diffusion, Ideogram, Flux, Runway, Kling, Pika, Suno, ElevenLabs
   • contentType — one of web-app | saas | mobile | game | extension | ai-service | media | other
   • deployUrl — the deployed public URL (vercel/netlify, etc.). If it isn't deployed: prefer uploading a static build output first (safest for apps with no backend). If that won't work (the app needs a server/database), you can instead give the public GitHub repo URL — it's a last resort that clones and tries npm run dev automatically (fails on private repos or repos with no dev script; apps using a remote database get demoted to a read-only demo)
   • appUrl — if the landing page and the actual app live at different URLs (e.g. / is the intro, /app is the real app), the app URL the demo/embed should open. Give BOTH appUrl and deployUrl when they differ and you aren't sure which one shows more — right before filming, the demo robot loads each and picks whichever screen actually shows the product (an app URL that's blank until you log in loses to a real landing page). appUrl is what the embed opens either way
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
   • description — 한 문단. 무엇이고 누구에게 쓸모있는지 (미완성이면 지향점까지)
   • builderNote — (선택) 공개 카드에 말풍선으로 뜨는 짧은 한마디. 문단이 아니라 한 줄, 예: "이게 제 첫 사이드프로젝트예요!"
   • demoHighlights — 자동 시연 영상에서 꼭 보여줄 핵심 3~5가지를 서술형으로. "○○를 클릭해" 같은 지시가 아니라 "○○ 기능이 이 제품의 핵심" 처럼. 500자 이내
   • tags — 이 작업에 쓴 AI 툴. 아래 목록에서 철자 그대로 골라줘(다른 이름은 조용히 버려짐): ChatGPT, Claude Code, Cursor, GitHub Copilot, Gemini, v0, Bolt.new, Windsurf, Lovable, Replit AI, Devin, Aider, Continue.dev, Codeium, Amazon Q, Perplexity, Midjourney, DALL-E, Stable Diffusion, Ideogram, Flux, Runway, Kling, Pika, Suno, ElevenLabs
   • contentType — web-app | saas | mobile | game | extension | ai-service | media | other 중 하나
   • deployUrl — 배포된 공개 URL (vercel/netlify 등). 미배포면: 우선 정적 빌드 산출물을 올려(백엔드 없는 앱에 제일 안전). 그걸로 안 되는 앱(서버·DB 필요)이면 공개 GitHub 저장소 URL을 대신 줘도 돼 — clone 후 자동으로 npm run dev를 시도하는 최후 수단이야(비공개 저장소·dev 스크립트 없는 리포는 실패, 원격 DB 쓰는 앱은 읽기전용 데모로 나옴)
   • appUrl — 랜딩과 실제 앱 화면 주소가 다르면(예: / 는 소개, /app 이 진짜 앱), 시연·임베드가 열어야 할 앱 URL. 둘 중 뭘 찍어야 할지 확실하지 않으면 appUrl과 deployUrl을 둘 다 줘 — 촬영 직전에 로봇이 두 화면을 각각 열어보고 실제로 제품이 보이는 쪽을 고른다(로그인 전엔 비어 있는 앱 화면은 제대로 된 랜딩에 진다). 임베드는 어느 쪽이든 appUrl을 연다
   • demoAccess — 로그인해야 화면이 보이는 앱이면, 시연 로봇이 로그인 없이 들어갈 길을 줘: { url(데모/게스트 진입 URL이나 경로, 예 "/demo"), params(추가 쿼리 파라미터, 예 {"guest":"1"}), note(거기서 데모 모드를 보는 법 한두 문장) }. 계정 아이디/비번은 절대 넣지 마 — 받지 않아. 게스트 경로 자체가 원천 불가능한 앱(E2E 암호화·기기 페어링 필수 등)이면 대신 { impossible: true, note: "이유" }를 줘 — 그럼 자동 촬영은 랜딩만 담으니 직접 만든 영상·스크린샷 동봉을 강하게 권장해
4) 셸을 쓸 수 있으면: ${NPX_PUBLISH} --json '<위 JSON>' 을 실행해 (토큰은 1)에서 저장했어).
   직접 찍은 스크린샷·시연 영상 파일이 있으면 --screenshot <경로> / --video <경로> 를 붙여 (이미지 png/jpg/webp/gif ≤5MB, 영상 mp4/webm ≤20MB — 영상을 주면 자동 촬영 대신 그 영상이 쓰여).
   셸이 없으면: 위 JSON만 출력해 — 내가 ${origin}/publish 에 붙여넣을게.
   이미 올린 걸 고치고 싶으면 같은 URL로 publish를 다시 실행해 — 새 초안이 생기지 않고 기존 초안이 갱신돼.`;
}
