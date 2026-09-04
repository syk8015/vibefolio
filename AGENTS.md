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
- `cli/`는 독립 배포 패키지(자체 `package.json`·`bin`) — 레포 코드 import 금지, HTTPS로 인제스트 API만 호출.
