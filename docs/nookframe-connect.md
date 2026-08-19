# Nookframe Connect — AI 원클릭 인제스트

바이브코더가 자기 AI(클로드코드 CLI·커서·아무 LLM 대화창)에 **한 줄/한 붙여넣기**만 하면,
그 프로젝트를 **만든 AI가 직접** 레포를 읽고 제목·설명·미완성 의도·자동시연 핵심포인트를
작성해 Nookframe 계정에 **초안**으로 올린다. 유저는 대시보드에서 확인 후 공개한다.

## 흐름

```
[1회] 대시보드 연결 패널 → [프롬프트 복사] — 누르는 순간 새 토큰이 자동 발급돼 프롬프트에
      내장된다(화면에 토큰 표시 없음, 프롬프트 1단계가 npx nookframe login <token>).
      다시 복사하면 새 토큰 발급 + 이전 자동발급 토큰(name=prompt-auto)은 자동 폐기.
[매번] 만든 AI에게 "이거 Nookframe에 올려줘"
        → AI가 레포 introspection → payload 작성 → npx nookframe publish (또는 /publish 붙여넣기)
        → POST /api/ingest → projects 행(is_draft=true) 생성 → reviewUrl 반환
[유저] 대시보드에서 AI 카피 확인·수정 → "확인하고 공개" → is_draft=false + 자동 시연 트리거
```

## 세 가지 클라이언트 표면

1. **CLI** — `npx nookframe publish` (셸 있는 에이전트: 클로드코드·커서·클라인 등). `cli/` 참고.
2. **MCP 서버** — `npx nookframe mcp`, 툴 `publish_to_nookframe` (클로드 데스크탑·커서 MCP).
3. **붙여넣기 프롬프트 + `/publish`** — 셸 없는 챗봇: AI가 JSON 출력 → 유저가 `/publish`에 붙여넣기.

정규 프롬프트·스니펫은 `lib/connectSnippets.ts` 한 곳에서 관리(설정 탭·docs 공유).

## 인증 — 개인 액세스 토큰(PAT)

- 형식 `nf_live_<random>`. DB(`api_tokens`)엔 **sha256 해시만** 저장, raw는 발급 응답에서 1회.
- 발급 `POST /api/tokens` (쿠키), 폐기 `DELETE /api/tokens/[id]` (쿠키·소프트 revoke), 목록은 RLS select.
- 자동발급(요청5): `POST /api/tokens {auto:true}` — name을 `prompt-auto` 센티널로 고정하고,
  같은 이름의 살아있는 토큰을 먼저 revoke(유저당 자동발급 토큰 상시 1개). 연결 패널의
  [프롬프트 복사]가 이 경로만 쓴다(수동 발급 UI는 제거, API의 name 발급은 하위호환 유지).
- 검증(`lib/apiToken.ts`): Bearer 헤더 전용 → 해시 조회(`.is('revoked_at',null)`) → user_id.
- **폭발반경**: 유출돼도 자기 계정의 **초안 INSERT만** 가능. 발행·데모예산 소진·토큰조회는
  전부 쿠키(`auth.uid()`) 전용이라 닿지 못한다. 유저당 토큰 ≤10, 활성 초안 ≤20, 레이트리밋 20/h(user_id 키).

## 인제스트 API — `POST /api/ingest`

- 인증: `Authorization: Bearer nf_live_…` (우선) 또는 쿠키 세션(`/publish` 경로).
- 본문:
  - `application/json` — `{ title, description?, builderNote?, demoHighlights?, demoScript?, tags?, contentType?, deployUrl?, appUrl?, demoAccess? }`
    (`appUrl` = 랜딩과 앱이 나뉜 제품의 실제 앱 화면 URL — 있으면 deployUrl보다 우선해 임베드·촬영 대상이 된다. 검증은 deployUrl과 동일)
    (`deployUrl`/`appUrl`은 `detectDemoSource`가 github 저장소 URL도 인식한다 — 미배포+서버/DB 필요 앱의
    최후수단으로 08-14부터 프롬프트·MCP·CLI가 안내. 공개 저장소·`dev`/`start` 스크립트 필수, 원격 DB
    감지 시 읽기전용 데모로 격하, best-effort(`local-runner/build.ts`). 같은 날 발견한 버그
    — `next dev`는 `--host`가 아니라 `-H`만 지원해 Next.js 프로젝트가 이 경로에서 죽던 것 — 도 같이 수정)
    (`deployUrl`·`appUrl`을 **둘 다** 주면 고르지 않은 쪽을 버리지 않고 `demo_access.altUrl`에 남긴다
    (08-14 피드백 B-4). 진입·임베드는 여전히 `appUrl` 우선이지만, **촬영 직전** 워커가 두 후보를 각각
    열어 한 장씩 찍고 비전 1콜로 정보량 많은 쪽을 골라 그 화면을 촬영한다(`local-runner/scout.ts`,
    판정 눈금 `app-ui > landing-only > login-wall > empty`). 이전에는 loser가 DB에 아예 도달하지 못해
    발행자가 틀리면 — 앱 URL이 로그인 전엔 빈 화면인 걸 모르면 — 빈 화면 영상이 그대로 나왔고, 이를
    알아채는 유일한 장치가 촬영 **후** 커버리지 판정(A-1)이었다. 후보가 하나면 호출 자체가 없어 비용
    0, 둘이면 편당 ~$0.02(`DEMO_SCOUT_MODEL`로 haiku 강등 가능 — probe로 동등 판정 확인). 비전 콜이
    실패하면 FAIL-OPEN(선언된 진입 URL 유지)이고, 로그인 벽 회피 정책 §4.7은 프롬프트가 아니라 코드가
    강제한다(후보 **전부** 게이트면 login-gated로 스킵, 일부면 열린 쪽으로 덮어씀). `impossible: true`면
    정찰을 아예 돌리지 않는다. 검증은 `url`과 동일 게이트 3중(인제스트 → trigger-demo → 워커 sink-side).
    CLI dry-run `--alt-url`, 무과금 훅 `NF_FAKE_SCOUT=0|1`, 프로브 `local-runner/probe-scout.ts`)
    (`demoAccess` = 로그인 필요 앱의 데모 모드 진입 정보 `{ url?, altUrl?, params?, note?, impossible? }` — url은 데모/게스트 진입 URL 또는 `/`경로(≤500자, 절대 URL은 deployUrl과 같은 콘텐츠호스트·사설망·SSRF 게이트), params는 진입 URL에 붙일 쿼리(≤12개, 키·값 ≤120자), note는 데모 모드 보는 법(≤500자, 레코더 브리핑에 데이터로 주입), impossible은 게스트 경로가 **원천 불가능**한 앱 선언(08-14 피드백 B-3: E2E 암호화·기기 페어링 필수 등 — true면 워커가 랜딩을 피사체로 브리핑하고 RUN REPORT에 `coverage: landing-only`를 찍는다. 이유는 note에, `reason` 키는 note로 수렴하는 관용 별칭. CLI `--access-impossible`). **계정 아이디/비번은 받지 않는다.** 인제스트는 `projects.demo_access` jsonb에 저장만 하고, 사용은 발행 시점 trigger-demo(절대 URL 재검증) → 로컬 워커(진입 URL 조립+브리핑)가 유일 경로 — demo_* 파이프라인 불변식과 무관한 유저 콘텐츠 컬럼이다. 마이그레이션: `supabase/migration_demo_access.sql`)
  - `multipart/form-data` — `payload`(위 JSON 문자열) + `bundle`(정적 사이트 zip, `index.html` 필수)
    + 선택 미디어 파트(요청1): `screenshot`(이미지 1장 → `thumbnail`, png/jpg/webp/gif ≤5MB) ·
    `video`(제작자 시연 영상 1개 → `video_url`=노출 1순위, mp4/webm ≤20MB). 형식은 서버가
    **매직바이트로 판정**(자칭 Content-Type·확장자 불신), 저장은 `{uid}/{rowId}/_media/`(행 수명주기 공유).
    video가 있으면 대시보드 발행 시 **자동 촬영을 생략**한다(노출 순위상 촬영본이 보이지 않으므로).
    내용 모더레이션은 1차 미도입 — 대시보드 수동 업로드와 같은 노출면(신고·admin 사후 대응).
    **⚠️ 인라인 multipart는 Vercel 함수 본문 상한 ~4.5MB(실측 2026-08-14: 4.2MB 통과·5MB 413)까지만
    실제로 통과한다** — 그보다 큰 파일은 아래 2단계로.
- **서명 URL 2단계 (대용량 zip ≤25MB · 영상 ≤20MB의 정규 경로)**:
  1. `POST /api/ingest` JSON에 `uploads: ["bundle"|"screenshot"|"video", …]`를 선언 →
     응답에 `{ projectId, uploads: {kind: signedUrl}, finalizeUrl }` (서명 URL은 서버 고정 키
     `{uid}/{rowId}/_upload/…` 전용, 클라 입력이 키에 안 섞임. bundle 선언 시 URL 없이도 아티팩트 인정)
  2. 각 파일을 signedUrl로 **PUT** (스토리지 직행 — Vercel 상한 우회)
  3. `POST /api/ingest/finalize` `{ projectId }` → 임시 오브젝트를 내려받아 **인라인과 동일 검증**
     (zip 안전 일습·미디어 매직바이트, 공유 코어=`lib/ingestStore.ts`) 후 demo_url·thumbnail·video_url
     연결, `_upload/` 삭제. 검증 실패 시 행 삭제(인라인과 동일 정책). is_draft=false 행은 409 거부
     (PAT 폭발반경 유지). 재호출은 멱등 200(같은 결과로 수렴 — `deduped:true` 플래그는 best-effort:
     지워진 임시 오브젝트가 스토리지 CDN 캐시에서 잠깐 더 읽히면 재처리로 돌아 플래그가 빠질 수 있음,
     실측 2026-08-14). CLI ≥0.1.3은 파일이 있으면 자동으로 이 경로.
- payload 매핑: `demoScript`→`demo_script`(**촬영 대본** — demoHighlights의 구조화 승격, 2026-08-20.
  `{ steps: [{ goal, where?, action?, text?, expect?, hold? }], skip?, prep? }`, 정규화=`lib/demoScript.ts`:
  스텝≤10·필드 캡·action 화이트리스트, 형식 어긋난 스텝은 조용히 드랍 후 에코의 `demoScriptSteps`/
  `demoScriptDropped`로 보고. 레코더에선 explore 브리핑의 등뼈가 되고 `mark_step` 툴로 커버리지를
  코드가 추적, 마지막 스텝 도달 전 종료는 재촉으로 거부되고, **완주하면 즉시 종료**(분량 하한·재촉은 대본 없는 판 전용 — 대본이 곧 필름 전체). hold(초 0.5~4)는 mark_step 매핑으로 그 스텝 첫 기록 액션에 붙어 replay 페이싱이 된다. **"제안"으로만 취급** — 하드룰·쓰기
  mock은 대본과 무관하게 유지. 컬럼 부재 시 3개 라우트+워커 전부 42703/PGRST204 디그레이드로 대본만
  빼고 동작), `demoHighlights`→`demo_user_hint`(≤500, 하위호환 산문 힌트 — 대본이 있으면 브리핑에서
  배경 맥락으로 강등),
  `builderNote`→`comment`(공개 카드 말풍선 — 08-14까지 프롬프트·MCP 스키마에 안내가 빠져 있어 AI가 실질적으로
  못 채웠다. pastePrompt·MCP TOOL 스키마 양쪽에 보완), `tags`는 `AI_TOOLS` **화이트리스트 정확 일치**로
  필터(다른 철자는 조용히 버려짐 — 프롬프트·MCP 스키마 enum에 전체 목록 명시로 보완), `contentType`은 8개 고정 id.
- 파일 경로: 행 id 확보 → `project-files/{uid}/{rowId}/…` 업로드 → `demo_url=/api/preview/…/index.html`.
- **upsert(요청4)**: 같은 유저의 **초안** 중 `demo_url`이 이번 진입 URL(appUrl 우선, `detectDemoSource`
  정규화 후 값)과 같은 행이 있으면 insert 대신 그 행을 **갱신**한다(재푸시=최신 페이로드가 진실.
  응답에 `upserted:true`). 초안 한정이라 공개된 행은 절대 안 건드림(PAT 폭발반경 유지). zip 경로는
  비교할 URL이 없어 항상 새 초안. 제작자 스크린샷(`_media/`) 썸네일은 thum.io로 안 덮는다.
  upsert된 행은 미디어 업로드 실패 시에도 삭제하지 않는다(신규 행만 고아 정리).
- 응답: `{ ok, projectId, reviewUrl, isDraft:true, upserted? }`. reviewUrl은 요청 origin 기준.

## 초안 관리 API (요청4) — `/api/ingest/drafts`

전부 PAT 또는 쿠키 인증, **is_draft=true 행만** 다룬다 — 공개된 프로젝트는 이 표면에 없다(목록에서
안 보이고, 수정·삭제는 409 `NOT_DRAFT`). 레이트리밋은 발행과 별도 버킷(`ingest-manage` 60/h).

- `GET /api/ingest/drafts` — 내 초안 목록 `{ ok, count, drafts:[{ id, title, …, reviewUrl }] }`.
- `PATCH /api/ingest/drafts/[id]` — 보낸 필드만 갱신(title/description/builderNote/demoHighlights/demoScript/
  tags/contentType/demoAccess — 검증은 생성 경로와 동일 규칙·동일 게이트). `deployUrl`·`appUrl`·
  `uploads`가 오면 400 `ARTIFACT_IMMUTABLE` — 아티팩트 교체는 같은 URL로 publish 재실행(upsert)이
  정규 경로(검증 경로 단일화).
- `DELETE /api/ingest/drafts/[id]` — 행 + 스토리지(행 폴더 `{uid}/{id}/` BFS: zip 확장·`_media`·
  `_upload`) 삭제. 인제스트 초안은 행을 먼저 만들고 그 id 폴더에 올리므로 demo-assets 라우트의
  M16(업로드 UUID≠행 id) 문제가 없고, R2 데모 산출물은 발행 후에만 생겨 초안엔 없다.
- CLI: `nookframe drafts` / `drafts update <id> --title …` / `drafts delete <id>` (≥0.1.4).
  MCP 툴: `list_nookframe_drafts` · `update_nookframe_draft` · `delete_nookframe_draft`.

### 보안 불변식
- **인제스트는 데모 파이프라인 컬럼을 절대 안 만진다.** `request_demo()`는 `auth.uid()`(쿠키) 기반이라
  PAT 경로와 안 맞음 → 데모는 **발행 시점**에 기존 쿠키 인증 `trigger-demo` 라우트가 처리(쿼터·모더레이션 상속).
- **초안 은닉 = RLS 단일 게이트.** `projects` 공개 SELECT 정책이 `is_draft=false or auth.uid()=user_id` →
  anon `createPublicClient`(캐시 공개 읽기 포함)는 물리적으로 초안을 못 읽는다. 앱 레이어 필터 없음.
- **서버 zip 하드닝**(서비스롤은 스토리지 RLS 우회): `safeRelativePath` + 최종 키 `{uid}/{rowId}/` prefix
  assert + zip-bomb 스트리밍 캡 + 본문 크기 캡(`lib/upload-safety.ts`). SSRF는 `assertSafePublicUrl` 재사용.
- 한계: `/api/preview`는 경로만으로 서빙 → 초안 업로드 **바이트는 URL 아는 자에게 열림**(rowId=추측불가 uuid라
  발견 불가). 메타데이터는 숨겨지나 바이트는 URL기밀(발행 업로드와 동일 포스처).

## 저장 결과 에코 — `accepted` (도그푸딩 C-1)

인제스트는 **틀린 값을 에러 대신 조용히 버린다**: AI 툴 태그는 철자가 `AI_TOOLS`와
안 맞으면 사라지고, `contentType` 오타는 `null`, `demoHighlights`는 500자에서 잘리고, `demoScript`는 형식 어긋난 스텝이 드랍되고,
형태가 어긋난 `demoAccess`는 통째로 없어진다. 이건 "AI가 올리다 실패하는 것보다
일부라도 올라가는 게 낫다"는 의도적 설계다 — 문제는 발행이 성공해도 **무엇이
살아남았는지 알 방법이 없었다**는 것(자체 도그푸딩에서 확인).

그래서 `POST /api/ingest`와 `PATCH /api/ingest/drafts/{id}`는 응답에 `accepted`를
싣는다. 요청 payload가 아니라 **저장 직전(PATCH는 갱신된 행)의 값**으로 조립한다.

- 조립: `app/api/ingest/shared.ts` 의 `buildAccepted()` — 표시 전용, 저장 내용 불변.
- 필드: `title` · `descriptionChars` · `builderNoteChars` · `demoHighlightsChars` · `demoScriptSteps` · `demoScriptDropped` ·
  `demoHighlightsTruncated` · `tags` · `droppedTags` · `contentType` ·
  `droppedContentType` · `entryUrl` · `scoutAltUrl` · `demoAccess` · `demoAccessDropped`.
- 파일 업로드(2단계) 경로는 `finalize` 응답에 `accepted`가 없으므로 CLI가 1단계 것을
  이어붙인다(`cli/src/publish.js`).
- 출력: `cli/src/echo.js` `formatAccepted()` — CLI 콘솔·MCP 툴 결과 공용. 한글 2칸
  폭을 계산해 열을 맞춘다. **구버전 서버는 `accepted`를 안 주므로 빈 배열로 조용히 물러난다.**
- `drafts list`도 초안마다 태그·분류·시연 핵심 유무를 함께 출력한다(사후 확인 수단).

## 관련 파일

- 마이그레이션: `supabase/migration_api_ingest.sql` (api_tokens · is_draft · RLS 정책 교체)
- libs: `lib/apiToken.ts` · `lib/upload-safety.ts` · `lib/projectTaxonomy.ts` · `lib/connectSnippets.ts`
- API: `app/api/ingest/route.ts` · `app/api/ingest/finalize/route.ts` · `app/api/ingest/drafts/*`
  (공용 인증·URL 게이트=`app/api/ingest/shared.ts`) · `app/api/tokens/route.ts` · `app/api/tokens/[id]/route.ts`
- UI: `components/dashboard/SettingsTab.tsx`(연결 탭) · `ProjectsTab.tsx`(초안 검토·발행) · `app/publish/*`
- CLI/MCP: `cli/` (배포명 `nookframe`)
- 검증: `scripts/probe-api-ingest.mjs`
