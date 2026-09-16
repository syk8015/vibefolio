# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# 레포 관례

- **테스트 스위트 = 프로브 스크립트.** 단위 테스트 러너는 없다. `npm test`(순수 함수 프로브)·`npm run typecheck`·`npm run lint`를 커밋 전에 돌리고, API/DB 동작은 `scripts/probe-*.mjs`(prod E2E, 키체인 경유)로 검증한다. 새 API 게이트를 만들면 프로브를 하나 같이 만든다.
- **`local-runner/`는 별도 tsconfig**(`local-runner/tsconfig.json`, 루트에서 exclude). 루트 `tsc`만 돌리면 러너는 검사되지 않는다 → `npm run typecheck`가 둘 다 돈다.
- **촬영은 로컬 맥 워커 하나뿐**(`npm run demo:batch`, 상세 `local-runner/README.md`). 클라우드 녹화 경로는 2026-09-04에 삭제됐다 — 되살리지 말 것.
- 한국어 UI 카피를 추가·수정하면 커밋 전 `npm run font:subset`(prebuild `font:check`가 막아준다).
- API 실패 응답은 `lib/apiError.ts`의 `apiError()` 한 가지 모양. 인증 게이트는 `lib/routeAuth.ts`(`requireUser`/`requireAdmin`)·`lib/workerAuth.ts`(`requireWorker`).

# Nookframe Connect (AI 인제스트 · 토큰)

외부 AI가 로그인된 유저 대신 프로젝트를 **초안**으로 밀어넣는 경로. `app/api/ingest`, `app/api/tokens/*`, `lib/apiToken.ts`, `lib/upload-safety.ts`, `cli/`, `app/publish/*`. 전체 레퍼런스는 `docs/nookframe-connect.md`.

지키지 않으면 보안이 깨지는 불변식:

- **인제스트는 `demo_*` 파이프라인 컬럼을 절대 쓰지 않는다.** PAT 경로엔 `auth.uid()`가 없어 `request_demo()`와 안 맞는다 — 데모는 **발행 시점**의 쿠키 인증 `trigger-demo`가 유일 채널.
- **초안 은닉은 RLS 단일 게이트**(`projects` SELECT: `is_draft=false or auth.uid()=user_id`). 공개 프로젝트 읽기에 앱 레이어 `is_draft` 필터를 달지 말 것(소유자 초안을 숨길 위험). 단 서비스롤/admin으로 **공개 출력**하는 새 경로엔 명시 필터 필수.
- **서버 zip은 서비스롤이라 스토리지 RLS를 우회** → `safeRelativePath` + 최종 키 `{uid}/{rowId}/` prefix assert + `lib/upload-safety.ts`의 zip-bomb/본문 캡이 유일 방어. 우회 금지.
- PAT는 `Authorization: Bearer` **헤더로만** 받는다(쿼리/폼 금지). raw 토큰은 발급 응답 1회만, DB엔 sha256만.
- **raw 토큰을 프롬프트에 박지 않는다**(2026-09-16). 프롬프트에 들어가는 건 1회용 페어링 코드(`nf_code_`, 30분·1회, `lib/connectCode.ts`)이고 `login <코드>`가 `/api/connect/exchange`에서 토큰으로 바꾼다 — 프롬프트는 AI 채팅창에 붙여넣는 물건이라 살아 있는 크리덴셜이 대화 기록에 남는다. 코드는 Bearer로 쓸 수 없다(`ingestAuth`가 401 `PAIRING_CODE`로 짚어준다).
- 발행 게이트의 사전 검사는 `/api/ingest?dryRun=1`(CLI `nookframe check`) **한 경로뿐**. 게이트 판정을 `cli/`에 복제하지 말 것 — 상수 사본이 갈라지면 검사와 발행의 답이 달라진다.
- **`/api/mcp`(원격 MCP)는 Bearer 전용이다** — `ingestAuth`의 쿠키 폴백을 여기에 붙이지 말 것. 쿠키를 받는 순간 남의 사이트가 로그인한 사람의 브라우저로 툴을 호출시킬 수 있다(CSRF). 툴 실행은 `lib/mcpDispatch.ts`가 **기존 API를 HTTP로 다시 부르는** 방식이다 — 게이트를 한 벌로 두려는 것이니 라우트 핸들러를 쪼개 import하지 말 것.
- **OAuth 발견 문서의 두 항목을 지우지 말 것**(`app/api/oauth/meta/authorization-server`): `client_id_metadata_document_supported: true` + `token_endpoint_auth_methods_supported: ["none"]`. 둘이 **같이** 있어야 Claude가 CIMD를 고르고, 하나라도 빠지면 동적 등록(우리가 안 만든 것)을 찾다가 조용히 연결 실패한다. `npm test`의 `probe-oauth-unit`이 막아준다.
- `cli/`는 독립 배포 패키지(자체 `package.json`·`bin`) — 레포 코드 import 금지, HTTPS로 인제스트 API만 호출.
- **`cli/src/schema.js`는 생성물이다**(2026-09-17) — 손으로 고치지 말 것. 원본은 `schema/publish.json` 한 장이고 `npm run schema:build`(`scripts/build-schema.mts`)가 만든다. AI 도구·분류·대상 화면·대본 액션 목록은 생성 시점에 `lib/projectTaxonomy.ts`·`lib/demoScript.ts`에서 읽어 박으므로 옛 손동기화 사본이 없다. 생성물을 손대면 `npm test`의 `probe-schema-drift`가 막는다. import 금지 규칙은 그대로다 — 생성기는 레포에서 돌며 파일을 **쓸** 뿐, `cli/`가 레포를 읽지 않는다.
