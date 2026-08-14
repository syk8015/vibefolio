// Nookframe Connect — "당신의 AI에 붙여넣으세요" 정규 스니펫. SettingsTab·/publish
// 페이지·docs가 같은 출처를 쓰도록 한 곳에 둔다. 프롬프트는 프로젝트를 "만든" AI가
// 레포를 introspection해 카피를 대신 쓰게 유도하고, 셸 유무에 따라 CLI 실행 또는
// JSON 출력으로 환경 자동적응한다.

export const NPX_PUBLISH = "npx nookframe@latest publish";
export const NPX_LOGIN = "npx nookframe@latest login <token>";

export function envExport(token: string): string {
  return `export NOOKFRAME_TOKEN="${token}"`;
}

export function pastePrompt(origin: string, locale: "ko" | "en" = "ko"): string {
  if (locale === "en") {
    return `Publish this project to Nookframe (a vibe-coding portfolio).

You're the AI that built this project, so read the repo yourself and describe it on my behalf:
1) Investigate from the README, package.json, the actual routes/screens, and git log. If it's still half-built, also work out what it was going to be.
2) Build a publish payload (JSON) with these fields:
   • title — a short, clear product name
   • description — one paragraph: what it is and who it's useful for (if unfinished, include where it's headed)
   • demoHighlights — 3–5 key things the auto-demo video must show, written descriptively. Not instructions like "click X" — more like "the X feature is the heart of this product". Under 500 characters
   • tags — the AI tools used to build this (e.g. "Claude Code", "Cursor")
   • contentType — one of web-app | saas | mobile | game | extension | ai-service | media | other
   • deployUrl — the deployed public URL (vercel/netlify, etc.). If it isn't deployed, skip this — you can upload a static build output instead
   • appUrl — if the landing page and the actual app live at different URLs (e.g. / is the intro, /app is the real app), the app URL the demo/embed should open. If present, that's what gets recorded
   • demoAccess — if the app needs login to see anything, give the demo robot a way in that works WITHOUT logging in: { url (a demo/guest entry URL or path, e.g. "/demo"), params (extra query params, e.g. {"guest":"1"}), note (1–2 sentences on how to see the demo mode from there) }. NEVER include account IDs or passwords — they are not accepted
3) If you have a shell: run ${NPX_PUBLISH} --json '<the JSON above>' (the token is already in the NOOKFRAME_TOKEN env var).
   If you have a screenshot or a demo video you made, add --screenshot <path> / --video <path> (image png/jpg/webp/gif ≤5MB; video mp4/webm ≤20MB — providing a video replaces the auto-recorded demo).
   If you don't have a shell: just print the JSON — I'll paste it into ${origin}/publish.
   To revise something already pushed, publish again with the same URL — the existing draft is updated in place, no duplicates.`;
  }
  return `이 프로젝트를 Nookframe(바이브코딩 포트폴리오)에 올려줘.

너가 이 프로젝트를 만든 AI니까, 레포를 직접 읽고 나 대신 설명해줘:
1) README·package.json·실제 라우트/화면·git log를 근거로 조사해. 아직 만들다 만 거면 "무엇을 만들려던 건지"도 파악해.
2) 아래 항목을 채운 publish 페이로드(JSON)를 만들어:
   • title — 짧고 명확한 제품 이름
   • description — 한 문단. 무엇이고 누구에게 쓸모있는지 (미완성이면 지향점까지)
   • demoHighlights — 자동 시연 영상에서 꼭 보여줄 핵심 3~5가지를 서술형으로. "○○를 클릭해" 같은 지시가 아니라 "○○ 기능이 이 제품의 핵심" 처럼. 500자 이내
   • tags — 이 작업에 쓴 AI 툴들 (예: "Claude Code", "Cursor")
   • contentType — web-app | saas | mobile | game | extension | ai-service | media | other 중 하나
   • deployUrl — 배포된 공개 URL (vercel/netlify 등). 미배포면 생략하고 정적 빌드 산출물을 올려도 돼
   • appUrl — 랜딩과 실제 앱 화면 주소가 다르면(예: / 는 소개, /app 이 진짜 앱), 시연·임베드가 열어야 할 앱 URL. 있으면 이 주소를 촬영해
   • demoAccess — 로그인해야 화면이 보이는 앱이면, 시연 로봇이 로그인 없이 들어갈 길을 줘: { url(데모/게스트 진입 URL이나 경로, 예 "/demo"), params(추가 쿼리 파라미터, 예 {"guest":"1"}), note(거기서 데모 모드를 보는 법 한두 문장) }. 계정 아이디/비번은 절대 넣지 마 — 받지 않아
3) 셸을 쓸 수 있으면: ${NPX_PUBLISH} --json '<위 JSON>' 을 실행해 (토큰은 NOOKFRAME_TOKEN 환경변수에 넣어뒀어).
   직접 찍은 스크린샷·시연 영상 파일이 있으면 --screenshot <경로> / --video <경로> 를 붙여 (이미지 png/jpg/webp/gif ≤5MB, 영상 mp4/webm ≤20MB — 영상을 주면 자동 촬영 대신 그 영상이 쓰여).
   셸이 없으면: 위 JSON만 출력해 — 내가 ${origin}/publish 에 붙여넣을게.
   이미 올린 걸 고치고 싶으면 같은 URL로 publish를 다시 실행해 — 새 초안이 생기지 않고 기존 초안이 갱신돼.`;
}
