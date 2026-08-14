# Nookframe Connect — AI 원클릭 인제스트

바이브코더가 자기 AI(클로드코드 CLI·커서·아무 LLM 대화창)에 **한 줄/한 붙여넣기**만 하면,
그 프로젝트를 **만든 AI가 직접** 레포를 읽고 제목·설명·미완성 의도·자동시연 핵심포인트를
작성해 Nookframe 계정에 **초안**으로 올린다. 유저는 대시보드에서 확인 후 공개한다.

## 흐름

```
[1회] 설정 → 연결 탭 → 토큰 발급 → NOOKFRAME_TOKEN 환경변수 (또는 npx nookframe login)
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
- 검증(`lib/apiToken.ts`): Bearer 헤더 전용 → 해시 조회(`.is('revoked_at',null)`) → user_id.
- **폭발반경**: 유출돼도 자기 계정의 **초안 INSERT만** 가능. 발행·데모예산 소진·토큰조회는
  전부 쿠키(`auth.uid()`) 전용이라 닿지 못한다. 유저당 토큰 ≤10, 활성 초안 ≤20, 레이트리밋 20/h(user_id 키).

## 인제스트 API — `POST /api/ingest`

- 인증: `Authorization: Bearer nf_live_…` (우선) 또는 쿠키 세션(`/publish` 경로).
- 본문:
  - `application/json` — `{ title, description?, builderNote?, demoHighlights?, tags?, contentType?, deployUrl?, appUrl?, demoAccess? }`
    (`appUrl` = 랜딩과 앱이 나뉜 제품의 실제 앱 화면 URL — 있으면 deployUrl보다 우선해 임베드·촬영 대상이 된다. 검증은 deployUrl과 동일)
    (`demoAccess` = 로그인 필요 앱의 데모 모드 진입 정보 `{ url?, params?, note? }` — url은 데모/게스트 진입 URL 또는 `/`경로(≤500자, 절대 URL은 deployUrl과 같은 콘텐츠호스트·사설망·SSRF 게이트), params는 진입 URL에 붙일 쿼리(≤12개, 키·값 ≤120자), note는 데모 모드 보는 법(≤500자, 레코더 브리핑에 데이터로 주입). **계정 아이디/비번은 받지 않는다.** 인제스트는 `projects.demo_access` jsonb에 저장만 하고, 사용은 발행 시점 trigger-demo(절대 URL 재검증) → 로컬 워커(진입 URL 조립+브리핑)가 유일 경로 — demo_* 파이프라인 불변식과 무관한 유저 콘텐츠 컬럼이다. 마이그레이션: `supabase/migration_demo_access.sql`)
  - `multipart/form-data` — `payload`(위 JSON 문자열) + `bundle`(정적 사이트 zip, ≤25MB, `index.html` 필수)
    + 선택 미디어 파트(요청1): `screenshot`(이미지 1장 → `thumbnail`, png/jpg/webp/gif ≤5MB) ·
    `video`(제작자 시연 영상 1개 → `video_url`=노출 1순위, mp4/webm ≤20MB). 형식은 서버가
    **매직바이트로 판정**(자칭 Content-Type·확장자 불신), 저장은 `{uid}/{rowId}/_media/`(행 수명주기 공유).
    video가 있으면 대시보드 발행 시 **자동 촬영을 생략**한다(노출 순위상 촬영본이 보이지 않으므로).
    내용 모더레이션은 1차 미도입 — 대시보드 수동 업로드와 같은 노출면(신고·admin 사후 대응).
- payload 매핑: `demoHighlights`→`demo_user_hint`(≤500, 레코더에 주입되는 유일 텍스트),
  `builderNote`→`comment`, `tags`는 AI_TOOLS 화이트리스트로 필터, `contentType`은 8개 고정 id.
- 파일 경로: 행 id 확보 → `project-files/{uid}/{rowId}/…` 업로드 → `demo_url=/api/preview/…/index.html`.
- 응답: `{ ok, projectId, reviewUrl, isDraft:true }`. reviewUrl은 요청 origin 기준.

### 보안 불변식
- **인제스트는 데모 파이프라인 컬럼을 절대 안 만진다.** `request_demo()`는 `auth.uid()`(쿠키) 기반이라
  PAT 경로와 안 맞음 → 데모는 **발행 시점**에 기존 쿠키 인증 `trigger-demo` 라우트가 처리(쿼터·모더레이션 상속).
- **초안 은닉 = RLS 단일 게이트.** `projects` 공개 SELECT 정책이 `is_draft=false or auth.uid()=user_id` →
  anon `createPublicClient`(캐시 공개 읽기 포함)는 물리적으로 초안을 못 읽는다. 앱 레이어 필터 없음.
- **서버 zip 하드닝**(서비스롤은 스토리지 RLS 우회): `safeRelativePath` + 최종 키 `{uid}/{rowId}/` prefix
  assert + zip-bomb 스트리밍 캡 + 본문 크기 캡(`lib/upload-safety.ts`). SSRF는 `assertSafePublicUrl` 재사용.
- 한계: `/api/preview`는 경로만으로 서빙 → 초안 업로드 **바이트는 URL 아는 자에게 열림**(rowId=추측불가 uuid라
  발견 불가). 메타데이터는 숨겨지나 바이트는 URL기밀(발행 업로드와 동일 포스처).

## 관련 파일

- 마이그레이션: `supabase/migration_api_ingest.sql` (api_tokens · is_draft · RLS 정책 교체)
- libs: `lib/apiToken.ts` · `lib/upload-safety.ts` · `lib/projectTaxonomy.ts` · `lib/connectSnippets.ts`
- API: `app/api/ingest/route.ts` · `app/api/tokens/route.ts` · `app/api/tokens/[id]/route.ts`
- UI: `components/dashboard/SettingsTab.tsx`(연결 탭) · `ProjectsTab.tsx`(초안 검토·발행) · `app/publish/*`
- CLI/MCP: `cli/` (배포명 `nookframe`)
- 검증: `scripts/probe-api-ingest.mjs`
