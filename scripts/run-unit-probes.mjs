// `npm test` — 네트워크·비밀값 없이 도는 순수 함수 프로브만 차례로 돌린다.
// 하나라도 실패하면 non-zero. prod E2E(`scripts/probe-*.mjs`)는 여기 안 넣는다:
// 그것들은 실제 API를 때리고 쿼터를 소비하므로 손으로 돌린다.
// 조건: ffmpeg가 PATH에 있어야 한다(zoom 프로브 2개) — 러너 머신엔 원래 있다.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const PROBES = [
  "scripts/probe-script-review-unit.mts",   // lib/demoScriptReview 대본 점검표
  "scripts/probe-nf-feedback-unit.mts",     // 외부 AI 피드백 — 셀렉터 수 "8/8 + back 1"·focus 통째 틀·대본 칸 경로·거절 field
  "scripts/probe-embeddable-unit.mts",      // lib/embeddable 임베드 헤더 판정
  "scripts/probe-ssrf-unit.mts",            // lib/ssrf 내부 주소 차단 — 숫자·IPv6 표기, localhost, 프로토콜
  "scripts/probe-body-cap-unit.mts",        // 요청 본문 상한 — 머리표 없는 조각 전송도 실제 바이트로 끊기
  "scripts/probe-upload-warnings-unit.mts", // 올린 파일 속 이메일·MAC·데이터 폴더 경고 — 자리표시는 안 잡고 값은 안 실음
  "scripts/probe-cli-gitignore-unit.mjs",   // CLI zip이 올리는 폴더 안 .gitignore를 따름 — 되살리기·하위 폴더·dist 위 규칙 무시
  "scripts/probe-small-holes-unit.mts",     // 작은 구멍 — 유입 주소는 호스트만·소셜 배지 www. 앞만·길이 상한 SQL not valid
  "scripts/probe-media-scan-unit.mts",      // 공개 그림 내용 검사 — 본 주소 건너뛰기·오류 하루 뒤 다시·답 다듬기·신고 사유·키 없으면 꺼짐
  "scripts/probe-prompt-secrets-unit.mts",  // 프롬프트 3종에 토큰이 안 실리는지(1회용 코드만)
  "scripts/probe-schema-drift.mts",         // 생성물(cli/src/schema.js·lib/mcpTools.ts)이 원본과 어긋났는지
  "scripts/probe-oauth-unit.mts",           // 원격 MCP OAuth — CIMD 두 항목·client_id 규칙·PKCE
  "scripts/probe-safe-next-unit.mts",     // 로그인 뒤 돌아갈 곳(?next=) — 밖으로 튕기는 모양 차단
  "scripts/probe-demo-access-unit.mts",     // demoAccess에 토큰·비번 이름이 오면 400(공개 칸이라 새어 나감)
  "scripts/probe-published-twin-unit.mts",  // 이미 공개된 같은 작품(NF-19) — 같은 외부 주소·같은 제목, 미리보기 주소는 안 엮음
  "scripts/probe-owner-interview-unit.mts", // 주인 인터뷰(필수) — 답 3개·자리 채우기 거절·가릴 것 목록·비공개 칸
  "scripts/probe-work-languages-unit.mts",  // 작품 두 언어(필수) — 기본 언어·앱 화면 언어·다른 언어 판·장면 자막
  "scripts/probe-project-columns.mts",      // projects 공개/비공개 칸 목록 == SQL GRANT, select("*") 금지(칸 단위 읽기 권한)
  "scripts/probe-owner-private-unit.mts",   // 대시보드 비공개 칸 합치기·"서버에 다시 물을지" 판정(대본만 고친 초안 놓치지 않기)
  "scripts/probe-native-app-unit.mts",      // 못 찍는 앱 판별 — 데스크톱·확장 추가, 웹으로 찍을 것은 안 건드림
  "scripts/probe-storage-list-unit.mts",    // 삭제 경로의 폴더 나열 — 1000개 넘는 폴더도 끝까지(탈퇴 즉시 파기)
  "scripts/probe-ingest-store-unit.mts",    // zip 저장 — 동시 업로드(상한 8)·실패 뒤 늦은 업로드 없음·새 행 폴더 정리
  "scripts/probe-html-body-unit.mts",
  "scripts/probe-intro-film-unit.mts",      // 소개 영상 — 대본 검사(두 언어·길이·예시/실측)·글자/분위기 고르기·틀에 시계/난수 없음
  "scripts/probe-handoff-unit.mts",         // 폰→컴퓨터 넘기기 — 이메일 정리·알림 창·링크에 이메일 없음       // 채팅창이 글자로 넘긴 HTML — 잘림 감지·울타리·zip 변환
  "scripts/probe-upload-sweep-unit.mts",    // 끝맺음 안 온 업로드 청소 — 하루 지난 빈 초안·임시 세션만, 파일 붙은 초안은 제외
  "scripts/probe-connect-activity-unit.mts", // 연결 창 "AI가 작업을 시작했어요" — 기준점 뒤 새 흔적만
  "scripts/probe-user-storage-unit.mts",    // 사용자 파일 R2 — 키 뿌리·같은 사이트 형식 규칙·주소↔경로·관리자 감싸기
  "scripts/probe-r2-sweep-unit.mts",        // R2 남은 영상 청소 — 작품 폴더만·행 없을 때만·하루 지난 것만·상한
  "scripts/probe-link-patrol-unit.mts",     // 공개 작품 링크 순찰 — 넘김·3일 죽음·위험 판정, 대상 고르기
  "scripts/probe-site-patrol-unit.mts",     // 점검 크론의 사이트 순찰 — 발견 문서 두 항목·MCP 401·명함 무대 영상 대상 고르기
  "scripts/probe-promo-unit.mts",           // 홍보 예약 — 피드 언어로 채널 고르기·하루 1편 한국 시각 칸·채널별 캡션 꼬리
  "scripts/probe-filming-status-unit.mts",  // AI가 묻는 촬영 상태 — 초안·몰아서 찍기·오래 걸림·실패 원문·보류 한국어 안 샘
  "scripts/probe-video-transcode-unit.mts", // 올린 영상 줄이기 — 줄인 파일 다시 안 집기·영상만·별 효과 없으면 mp4는 상자만
  "scripts/probe-ui-rules.mjs",             // 화면·글 기준(docs/ui-rules.md) — 기준선보다 새로 어긋난 것만 실패(작은 글자·직접 쓴 색·테두리·말투…)
  "scripts/probe-cli-input.mjs",            // CLI --file·표준입력·schema (127.0.0.1 가짜 서버, 네트워크 없음)
  "local-runner/probe-focus-coalesce.ts",   // 스크롤 병합·focus 카메라 산식
  "local-runner/probe-hover-merge.ts",      // 같은 요소 연속 호버 — 새 장면이면 합치지도 지우지도 않는다
  "local-runner/probe-zoomexpr.ts",         // zoompan 식 가드
  "scripts/test-zoom-filter-local.mts",     // 로컬 카메라 ffmpeg 체인
  "local-runner/dispatch/probe-dispatch.mjs", // 자동 실행기 — 큐·한도 게이트·산출물 수거 (node --test 53개)
];

let failed = 0;
// cli/는 ESM 평문 JS라 타입검사가 없다 — 문법만이라도 실행 문맥(ESM)에서 확인한다.
// (0.1.10 MCP 서버가 따옴표 하나로 죽은 채 발행됐던 사고의 재발 방지.)
// node --check는 첫 파일만 검사하고 뒤 파일은 스크립트 인자로 넘긴다 — 파일마다 따로 돌린다.
// 목록은 폴더에서 읽는다(새 파일을 적어 넣는 걸 잊어도 빠지지 않게).
{
  const files = [
    ...readdirSync("cli/src").filter((f) => f.endsWith(".js")).map((f) => `cli/src/${f}`),
    "cli/bin/nookframe.js",
  ];
  const bad = [];
  for (const f of files) {
    const r = spawnSync("node", ["--check", f], { encoding: "utf8" });
    if (r.status !== 0) bad.push(`${f}\n${r.stderr.split("\n").slice(0, 6).join("\n")}`);
  }
  const ok = bad.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} node --check cli/**/*.js (${files.length} files)`);
  if (!ok) console.log(bad.join("\n"));
}
for (const file of PROBES) {
  const t0 = Date.now();
  const r = spawnSync("npx", ["-y", "tsx", file], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!ok) console.log((r.stdout + r.stderr).split("\n").slice(-25).join("\n"));
}
console.log(failed ? `\n${failed} probe(s) FAILED` : `\nall ${PROBES.length} probes passed`);
process.exit(failed ? 1 : 0);
