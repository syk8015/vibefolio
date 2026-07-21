<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Trigger.dev (v4)

Hard rules (violating any of these breaks the app):

- Import from `@trigger.dev/sdk` only. NEVER use v2 `client.defineJob`.
- `triggerAndWait()` returns a Result object `{ ok, output, error }` — check `result.ok` before touching `result.output`.
- Never wrap `wait.*`, `triggerAndWait`, or `batchTriggerAndWait` in `Promise.all` / `Promise.allSettled`.

Before touching `src/trigger/*`, `trigger.config.ts`, or anything importing `@trigger.dev` (currently `app/api/projects/[id]/trigger-demo/route.ts` and `scripts/trigger-build.mjs`), read `docs/trigger-dev.md` — full v4 reference for tasks, queues/concurrency, debounce, retries, batch, waits, machines, idempotency, and metadata (plus the Realtime reference — unused in this repo).

# Nookframe Connect (AI 인제스트 · 토큰)

외부 AI가 로그인된 유저 대신 프로젝트를 **초안**으로 밀어넣는 경로. `app/api/ingest`, `app/api/tokens/*`, `lib/apiToken.ts`, `lib/upload-safety.ts`, `cli/`, `app/publish/*`. 전체 레퍼런스는 `docs/nookframe-connect.md`.

지키지 않으면 보안이 깨지는 불변식:

- **인제스트는 `demo_*` 파이프라인 컬럼을 절대 쓰지 않는다.** PAT 경로엔 `auth.uid()`가 없어 `request_demo()`와 안 맞는다 — 데모는 **발행 시점**의 쿠키 인증 `trigger-demo`가 유일 채널.
- **초안 은닉은 RLS 단일 게이트**(`projects` SELECT: `is_draft=false or auth.uid()=user_id`). 공개 프로젝트 읽기에 앱 레이어 `is_draft` 필터를 달지 말 것(소유자 초안을 숨길 위험). 단 서비스롤/admin으로 **공개 출력**하는 새 경로엔 명시 필터 필수.
- **서버 zip은 서비스롤이라 스토리지 RLS를 우회** → `safeRelativePath` + 최종 키 `{uid}/{rowId}/` prefix assert + `lib/upload-safety.ts`의 zip-bomb/본문 캡이 유일 방어. 우회 금지.
- PAT는 `Authorization: Bearer` **헤더로만** 받는다(쿼리/폼 금지). raw 토큰은 발급 응답 1회만, DB엔 sha256만.
- `cli/`는 독립 배포 패키지(자체 `package.json`·`bin`) — 레포 코드 import 금지, HTTPS로 인제스트 API만 호출.
