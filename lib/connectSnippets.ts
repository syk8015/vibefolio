// Nookframe Connect — "당신의 AI에 붙여넣으세요" 정규 스니펫. SettingsTab·/publish
// 페이지·docs가 같은 출처를 쓰도록 한 곳에 둔다. 프롬프트는 프로젝트를 "만든" AI가
// 레포를 introspection해 카피를 대신 쓰게 유도하고, 셸 유무에 따라 CLI 실행 또는
// JSON 출력으로 환경 자동적응한다.

export const NPX_PUBLISH = "npx nookframe@latest publish";
export const NPX_LOGIN = "npx nookframe@latest login <token>";

export function envExport(token: string): string {
  return `export NOOKFRAME_TOKEN="${token}"`;
}

export function pastePrompt(origin: string): string {
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
3) 셸을 쓸 수 있으면: ${NPX_PUBLISH} --json '<위 JSON>' 을 실행해 (토큰은 NOOKFRAME_TOKEN 환경변수에 넣어뒀어).
   셸이 없으면: 위 JSON만 출력해 — 내가 ${origin}/publish 에 붙여넣을게.`;
}
