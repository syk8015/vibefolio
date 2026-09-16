# Nookframe Connect — AI 원클릭 인제스트

바이브코더가 자기 AI(클로드코드 CLI·커서·아무 LLM 대화창)에 **한 줄/한 붙여넣기**만 하면,
그 프로젝트를 **만든 AI가 직접** 레포를 읽고 제목·설명·미완성 의도·자동시연 핵심포인트를
작성해 Nookframe 계정에 **초안**으로 올린다. 유저는 대시보드에서 확인 후 공개한다.

## 흐름

```
[1회] 대시보드 연결 패널 → [프롬프트 복사] — 누르는 순간 **1회용 페어링 코드**가 발급돼
      프롬프트에 내장된다(프롬프트 1단계가 npx nookframe login <nf_code_…>, 30분·1회).
      토큰은 여기서 안 만들어진다 — CLI가 /api/connect/exchange에서 교환하는 순간 생기고,
      그때 이전 자동발급 토큰(name=prompt-auto)이 폐기된다. 복사만 하고 안 쓰면 토큰 0개.
[매번] 만든 AI에게 "이거 Nookframe에 올려줘"
        → AI가 레포 introspection → payload 작성 → npx nookframe check (발행 전 서버 드라이런)
        → npx nookframe publish (또는 /publish 붙여넣기)
        → POST /api/ingest → projects 행(is_draft=true) 생성 → reviewUrl 반환
[유저] 대시보드에서 AI 카피 확인·수정 → "확인하고 공개" → is_draft=false + 자동 시연 트리거
```

## 세 가지 클라이언트 표면

1. **CLI** — `npx nookframe publish` (셸 있는 에이전트: 클로드코드·커서·클라인 등). `cli/` 참고.
   payload JSON은 `--file <path>` · `--json -`(표준입력) · `--json '<json>'` 중 하나로 받는다(≥0.1.13 —
   명령줄 인자는 셸이 먼저 읽어 작은따옴표·줄바꿈·한글에서 깨졌다). 셋 다 `cli/src/jsonInput.js` 한 곳이고
   rerecord·drafts update도 같은 규칙. 필드 목록은 `nookframe schema`(JSON Schema) — MCP `publish_to_nookframe`
   입력 스키마와 같은 출처 `cli/src/schema.js`(**생성물** — 원본은 `schema/publish.json`, `npm run schema:build`)라,
   JSON 안의 `dir`·`screenshot`·`video`도 CLI가 로컬 경로로 쓴다.
2. **MCP 서버** — `npx nookframe mcp`, 툴 `publish_to_nookframe` (클로드 데스크탑·커서 MCP).
3. **붙여넣기 프롬프트 + `/publish`** — 셸 없는 챗봇: AI가 JSON 출력 → 유저가 `/publish`에 붙여넣기.

정규 프롬프트·스니펫은 `lib/connectSnippets.ts` 한 곳에서 관리(설정 탭·docs 공유).

**프롬프트 본문은 화면 언어와 무관하게 영어 하나**(2026-09-05 사용자 확정). 붙여넣기·초안 고치기·
재촬영·`/publish` 되돌려보내기 네 프롬프트 모두 한국어판을 없앴다 — 같은 내용을 영어로 쓰면 토큰이
절반쯤 줄고 지시가 더 곧이곧대로 먹힌다. PAT 응답이 영어 고정인 것과 같은 이유(§인제스트 응답 언어):
**AI가 읽는 표면은 영어**. 대신 프롬프트 첫머리에 `outputLanguageLine(locale)`이 들어가 AI가 만드는
카피(title·description·builderNote·note)를 어느 언어로 쓸지 못박는다 — 그건 사람이 명함에서 읽는
글이라 화면 언어를 따라야 한다. `cli/`의 도움말·에러 메시지도 영어다(0.1.11부터).

## 인증 — 개인 액세스 토큰(PAT)

- 형식 `nf_live_<random>`. DB(`api_tokens`)엔 **sha256 해시만** 저장, raw는 발급 응답에서 1회.
- 발급 `POST /api/tokens` (쿠키), 폐기 `DELETE /api/tokens/[id]` (쿠키·소프트 revoke), 목록은 RLS select.
- 자동발급(요청5): `POST /api/tokens {auto:true}` — name을 `prompt-auto` 센티널로 고정하고,
  같은 이름의 살아있는 토큰을 먼저 revoke(유저당 자동발급 토큰 상시 1개). 발급 규약 자체는
  `lib/apiToken.ts issueToken()` 한 곳이다(2026-09-16 — 페어링 코드 교환이 같은 규칙을 써야 해서).

### 페어링 코드 — 프롬프트에 토큰을 박지 않는다 (2026-09-16 사용자 확정)

문제: [프롬프트 복사]는 그 순간 발급한 **raw PAT**를 프롬프트 1단계(`npx nookframe login <토큰>`)에
평문으로 넣었다. 그 프롬프트는 **AI 채팅창에 붙여넣는 물건**이라, 살아 있는 크리덴셜이 대화
기록·요약·메모리에 영구히 남는다(사용자 전역 규칙 "비밀은 파일에 두고 코드가 읽는다"와 정면 충돌).

- 프롬프트에 들어가는 것 = **1회용 페어링 코드** `nf_code_<32바이트 base64url>`.
  `connect_codes`(마이그레이션 `supabase/migration_connect_code.sql`)엔 **sha256만**, 유효기간
  `CONNECT_CODE_TTL_MIN=30`분, **1회용**. 기록에 남는 코드는 곧 죽어 쓸모가 없다.
- 발급 `POST /api/connect/code`(쿠키·유저 30/h) → `{ code, expiresAt, expiresInMinutes }`.
  **토큰은 이때 만들지 않는다** — 교환 시점에 만들어지므로, 복사만 하고 안 쓰면 토큰은 생기지도 않는다
  (예전엔 복사마다 토큰 하나가 남았다).
- 교환 `POST /api/connect/exchange`(**인증 없음 — 코드가 곧 인증**, IP 20/h) → `{ token, prefix }`.
  소비는 조건부 UPDATE 한 방(`used_at is null` + 만료 전)이라 같은 코드의 동시 교환에서 한쪽만 이긴다
  (`lib/connectCode.ts`). 발급되는 토큰은 `prompt-auto` 센티널 — 새로 페어링하면 이전 자동 토큰은 죽는다.
  없는 코드·쓴 코드·만료 코드 **전부 같은 401**(열거 실마리 없음). 쿠키를 안 쓰므로 CSRF 표면도 없다.
- **코드는 Bearer로 쓸 수 없다.** 옛 CLI(≤0.1.14)의 `login <코드>`는 코드를 그대로 토큰으로 저장하므로
  `ingestAuth`가 `nf_code_`를 먼저 보고 401 `PAIRING_CODE`로 "먼저 login을 실행하라"고 짚어준다.
- 예전에 기각된 "1회용 토큰"과 다르다: **1회용인 것은 코드뿐**이고 교환으로 받은 PAT는 계속 살아 있어
  같은 초안 재발행(upsert·draftId) 경로가 그대로다.
- CLI `login`은 두 입력을 받는다(`cli/src/login.js`): `nf_code_…`는 교환해서 저장, `nf_live_…`는 그대로 저장
  (이미 저장해 둔 토큰·`NOOKFRAME_TOKEN`을 깨뜨리지 않는다).
- 검증: `node scripts/probe-connect-code.mjs`(prod E2E 14단언 — 1회용·만료·해시만 저장·센티널 폐기·
  Bearer 거절·발급은 세션 필수). ⚠️ 이 프로브는 `prompt-auto` 토큰을 갈아치운다.
- **전환 순서**(둘 다 완료): ①서버·CLI 먼저 — 코드 발급·교환 API + `login <코드>`(커밋 1).
  ②프롬프트 3종(`pastePrompt`·`buildDraftFixPrompt`·`rerecordPrompt`)과 연결 패널·초안 검토 창·
  재촬영 프롬프트 라우트가 코드를 쓰게 바꾸는 것은 **npm 0.1.15 발행 확인 뒤**(커밋 2) — 먼저
  바꾸면 옛 CLI가 코드를 토큰으로 저장해 모든 PAT 호출이 401이 된다(09-15 `--file` 교체와 같은 규칙).
  재촬영 프롬프트의 curl 폴백은 **2단계**가 됐다(`/api/connect/exchange`로 코드→토큰, 그 토큰으로
  제출) — 셸은 있는데 npm이 막힌 경로를 살리면서도 프롬프트엔 코드만 남는다.
- 검증(`lib/apiToken.ts`): Bearer 헤더 전용 → 해시 조회(`.is('revoked_at',null)`) → user_id.
- **폭발반경**: 유출돼도 자기 계정의 **초안 INSERT만** 가능. 발행·데모예산 소진·토큰조회는
  전부 쿠키(`auth.uid()`) 전용이라 닿지 못한다. 유저당 토큰 ≤10, 활성 초안 ≤20, 레이트리밋 20/h(user_id 키).

## 원격 MCP — 셸 없는 채팅창 AI (2026-09-17 사용자 확정)

`POST https://nookframe.com/api/mcp`. `npx nookframe mcp`(stdio)를 **실행할 수 없는** AI —
claude.ai 웹 같은 채팅창 — 가 우리 서버를 직접 부르는 통로다. Claude 설정 → 커넥터 →
[커스텀 커넥터 추가]에 이 주소를 넣으면 붙는다.

툴 정의는 stdio 쪽과 **같은 원본에서 생성된다**(`schema/publish.json` → `npm run schema:build`
→ `lib/mcpTools.ts`). 다른 점은 하나뿐 — 로컬 경로 필드(`dir`·`screenshot`·`video`)가 없다.
채팅 AI에겐 우리 서버에 그 경로가 가리킬 파일이 없기 때문이고, 설명의 그 대목만
`{{FILES}}`·`{{MEDIA}}` 자리표시로 갈라 채운다(본문은 한 벌).

### 두 시대를 한 주소에서 받는다

MCP 규격이 2026-07-28에 갈아엎였다: `initialize`·세션·`ping`이 사라지고 `server/discover`가
그 자리에 왔다. 그런데 Claude는 전환 한가운데라 표면에 따라 **옛 방식으로 말을 거는 경우가
있다**(2026-08 실측 보고). 한쪽만 구현하면 화면엔 "연결 실패"만 뜨고 이유는 안 나온다.
그래서 `app/api/mcp/route.ts`는 본문에 `_meta["io.modelcontextprotocol/protocolVersion"]`이
있는지로 갈라 읽는다.

- 신규격: `server/discover` · `tools/list`(+`ttlMs`·`cacheScope`) · `tools/call`(+`resultType`).
  헤더(`MCP-Protocol-Version`·`Mcp-Method`·`Mcp-Name`)가 본문과 어긋나면 `-32020`.
- 옛 규격: `initialize`(받은 판을 그대로 되돌려줌) · `notifications/initialized`(202) · `ping`.
  **세션 id는 절대 만들지 않는다** — 우리는 무상태다.
- GET·DELETE는 `405`. 모르는 메서드는 `404` + `-32601`.

### 인증 = OAuth (CIMD)

사용자 확정(09-17): 요청 헤더에 PAT를 손으로 넣는 방식(A)이 아니라 OAuth(B). 비개발자가
[허용] 한 번으로 끝나고, 살아 있는 토큰을 사람이 복사해 옮기지 않는다.

| 조각 | 자리 |
|---|---|
| 보호 자원 메타데이터 | `/.well-known/oauth-protected-resource[/api/mcp]` |
| 인증 서버 메타데이터 | `/.well-known/oauth-authorization-server` |
| 동의 화면(사람이 보는 곳) | `/oauth/authorize` — **페이지** |
| [허용] 처리 | `POST /api/oauth/authorize/decision` |
| 토큰 교환·갱신 | `POST /api/oauth/token` (폼 인코딩) |
| 핵심 로직 | `lib/oauth.ts` · 테이블 `supabase/migration_oauth.sql` |

`.well-known` 주소는 `next.config.ts`의 rewrite가 잇는다 — `app/` 안의 점으로 시작하는
폴더는 라우트로 잡히지 않는다.

**CIMD**(Client ID Metadata Document)는 등록 절차가 없는 방식이다. `client_id`로 https URL이
오고 우리가 그 주소를 읽어 이름·허용 리다이렉트 주소를 알아낸다. 문서는 그쪽이 스스로 쓴
자기소개라 믿을 수 없으므로, **동의 화면의 큰 글씨는 이름이 아니라 client_id URL의 호스트**다.

토큰은 기존 `api_tokens` 행 하나로 산다(같은 `nf_live_` 스킴) — 그래서 `verifyToken`·
`ingestAuth`·연결 패널의 [폐기]가 전부 그대로 동작한다. OAuth가 더한 것은 만료·갱신·발급자
컬럼과 인증 코드 테이블뿐이다. 액세스 12시간 · 갱신 90일 · 갱신 때마다 회전.

### 함정

- **`/api/mcp`는 Bearer 전용.** `ingestAuth`의 쿠키 폴백을 붙이면 남의 사이트가 로그인한
  사람의 브라우저로 툴을 호출시킬 수 있다(CSRF).
- **발견 문서의 CIMD 두 항목**(`client_id_metadata_document_supported: true` +
  `token_endpoint_auth_methods_supported: ["none"]`)이 **같이** 있어야 Claude가 CIMD를 고른다.
  하나라도 빠지면 동적 등록(우리가 안 만든 것)을 찾다가 조용히 실패한다.
- **커넥터는 추가한 뒤 인증 설정을 못 바꾼다** — 틀리면 지우고 다시 추가해야 하고, 조직이면
  구성원 전원이 다시 연결한다.
- **주소가 `/sse`로 끝나면** 클라이언트가 옛 SSE 전송으로 잡는다. 끝 슬래시도 대상 판정을 깬다.
- **Claude는 MCP 주소의 리다이렉트를 따라가고, 그때 Authorization 헤더가 사라진다** —
  다른 호스트로 튀는 순간 401이 되고 "인증 실패"만 남는다. 이 경로엔 리다이렉트를 두지 말 것
  (미들웨어의 온보딩 리다이렉트에서 `/.well-known`을 제외해 둔 이유).
- `client_id`의 점 세그먼트는 **원문에서** 검사한다 — URL 파서가 `/a/../b`를 `/b`로 펴 버린다.
- 툴 실행은 `lib/mcpDispatch.ts`가 **기존 API를 HTTP로 다시 부른다**. 게이트를 한 벌로 두려는
  것이니 라우트 핸들러를 쪼개 import하지 말 것.
- 검증: `npm test`의 `probe-oauth-unit`(38단언 — CIMD 두 항목·client_id 규칙·PKCE·문서 모양).

## 인제스트 API — `POST /api/ingest`

- 인증: `Authorization: Bearer nf_live_…` (우선) 또는 쿠키 세션(`/publish` 경로).
- 본문:
  - `application/json` — `{ title, description?, builderNote?, demoHighlights?, demoScript?, tags?, contentType?, targetDevice, deployUrl?, appUrl?, demoAccess? }`
    (`demoScript`·`demoAccess`·`targetDevice`는 **필수 게이트** — 자세한 건 아래 "발행 게이트 3종")
    (`targetDevice` = 작품이 주로 맞춘 화면 `"mobile"`|`"desktop"`(2026-09-15) → `projects.target_device`. 초안 검토 창이 이 답으로
    미리보기 틀(폰 402×874 / PC 1280×800)을 고르고, 사람이 바꾸는 스위치는 없다. contentType의 `mobile`(분류)과 다른 질문 —
    폰 우선 웹앱은 `web-app`+`mobile`. 답이 없는 예전 초안은 분류로 짐작(`lib/projectTaxonomy.ts previewDevice`).
    마이그레이션: `supabase/migration_target_device.sql` — 컬럼이 없으면 세 라우트 모두 그 컬럼만 빼고 동작)
    (`appUrl` = 랜딩과 앱이 나뉜 제품의 실제 앱 화면 URL — 있으면 deployUrl보다 우선해 임베드·촬영 대상이 된다. 검증은 deployUrl과 동일)
    (`deployUrl`/`appUrl`은 `detectDemoSource`가 github 저장소 URL도 인식한다 — 미배포+서버/DB 필요 앱의
    최후수단으로 08-14부터 프롬프트·MCP·CLI가 안내. 공개 저장소 필수. JS는 `dev`/`start` 스크립트로,
    파이썬 웹앱(Streamlit·Gradio·Dash·Django·Flask·FastAPI import 감지)은 pip install 후 프레임워크별
    명령으로 자동 실행(08-20, `servePython`). **폰 앱은 웹 타깃을 대신 빌드한다**(08-26, `detectWebBuild`
    → `serveFlutterWeb`/`serveExpoWeb`): pubspec.yaml=Flutter → `flutter build web`(SDK는 E2B 템플릿에
    프리베이크), package.json에 expo/react-native → `expo export --platform web`(웹 의존성 3종 자동 추가,
    실패 시 구 SDK `export:web` 재시도). 이 검사는 **JS dev 스크립트 분기보다 먼저** 돈다 — Expo
    package.json에는 항상 `start`가 있어 그냥 두면 Metro를 90초 기다리다 죽는다. zip도 같은 짝:
    `pickZipAnchor`가 pubspec.yaml을 index.html보다 **먼저** 본다(소스 트리의 web/index.html은 빌드 전
    껍데기 → 그대로 띄우면 흰 화면). 웹 타깃이 없는 네이티브(Swift·Kotlin·Electron·Unity)는 여전히 불가
    — 프롬프트가 `video` 첨부로 안내한다. 검증=`local-runner/probe-webbuild.ts`.
    — 셋 다 아니면 정적 index.html, 그것도 없는 러너블 코드
    (package.json 또는 *.py)는 ttyd 라이브 터미널 촬영(08-20, `serveTerminal` — .env* 삭제 후 기동,
    policy=full, 브리핑=`buildTerminalBrief`)→최후에 not-a-webapp. 원격 DB
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
    (`demoAccess` = 로그인 필요 앱의 데모 모드 진입 정보 `{ url?, altUrl?, params?, note?, impossible?, noLogin? }` — **2026-08-27부터 필수** — url은 데모/게스트 진입 URL 또는 `/`경로(≤500자, 절대 URL은 deployUrl과 같은 콘텐츠호스트·사설망·SSRF 게이트), params는 진입 URL에 붙일 쿼리(≤12개, 키·값 ≤120자), note는 데모 모드 보는 법(≤500자, 레코더 브리핑에 데이터로 주입), noLogin은 "로그인이 아예 필요 없고 첫 화면부터 전 기능이 눌린다"는 명시 선언(2026-08-27 — 워커는 이 값을 쓰지 않는다. 존재 이유는 발행 AI가 로그인 문제를 **건너뛰지 못하게** 하는 것뿐이다. `loginRequired: false`는 관용 별칭). impossible은 게스트 경로가 **원천 불가능**한 앱 선언(08-14 피드백 B-3: E2E 암호화·기기 페어링 필수 등 — true면 워커가 랜딩을 피사체로 브리핑하고 RUN REPORT에 `coverage: landing-only`를 찍는다. 이유는 note에, `reason` 키는 note로 수렴하는 관용 별칭. CLI `--access-impossible`). **계정 아이디/비번은 받지 않는다.** 인제스트는 `projects.demo_access` jsonb에 저장만 하고, 사용은 발행 시점 trigger-demo(절대 URL 재검증) → 로컬 워커(진입 URL 조립+브리핑)가 유일 경로 — demo_* 파이프라인 불변식과 무관한 유저 콘텐츠 컬럼이다. 마이그레이션: `supabase/migration_demo_access.sql`)
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
     응답에 `{ projectId, uploads: {kind: signedUrl}, finalizeUrl }` (서명 URL은 서버가 만든 키
     `{uid}/{rowId}/_upload/<session>/…` 전용, 클라 입력이 키에 안 섞임. 세션 폴더는 업로드마다 새로 만든다 —
     고정 키를 다시 쓰면 같은 초안에 다시 올릴 때 CDN 캐시의 옛 임시 파일이 새 파일 대신 읽혔다(09-15 prod
     실측). finalize는 가장 새 세션을 목록 조회(캐시 안 탐)로 찾는다. bundle 선언 시 URL 없이도 아티팩트 인정)
  2. 각 파일을 signedUrl로 **PUT** (스토리지 직행 — Vercel 상한 우회)
  3. `POST /api/ingest/finalize` `{ projectId }` → 임시 오브젝트를 내려받아 **인라인과 동일 검증**
     (zip 안전 일습·미디어 매직바이트, 공유 코어=`lib/ingestStore.ts`) 후 demo_url·thumbnail·video_url
     연결, `_upload/` 삭제. 검증 실패 시 이번 발행이 만든 행만 삭제(인라인과 동일 정책 — 이미 있던 초안은
     아래 draftId 절의 교체 표식을 보고 남긴다). is_draft=false 행은 409 거부
     (PAT 폭발반경 유지). 재호출은 멱등 200(같은 결과로 수렴 — `deduped:true` 플래그는 best-effort:
     지워진 임시 오브젝트가 스토리지 CDN 캐시에서 잠깐 더 읽히면 재처리로 돌아 플래그가 빠질 수 있음,
     실측 2026-08-14). CLI ≥0.1.3은 파일이 있으면 자동으로 이 경로.
- **영상 선언만 하고 안 올린 발행은 finalize가 막는다**(2026-09-16, 400 `NO_FILM_SOURCE`). `uploads:["video"]`
  선언은 대본·로그인 게이트를 면제해 준다(자동 촬영을 건너뛰므로) — 그런데 발행 시점엔 파일이 아직 없어
  "정말 올릴 건지"를 서버가 알 수 없다. 영상이 끝내 안 오면 대본도 영상도 없는 초안이 남고, 공개되면 픽셀
  추측이라는 옛 촬영 경로로 간다. 그래서 두 곳에서 막는다: ①**발행 시점**(`route.ts` 갱신 브랜치) — 영상이
  아직 안 온 요청은 `demo_script`·`demo_access`를 **덮지 않는다**(예전엔 payload 값으로 그대로 덮어서 기존
  초안의 대본이 그 순간 사라졌다) ②**finalize** — 연결을 마친 뒤에도 영상도 대본도 없으면 400으로 거절하고,
  기존 정책대로 이번 발행이 만든 행만 지운다(교체 발행이면 ①덕에 옛 대본이 살아 있다). 아무것도 안 올린
  finalize는 그 앞의 `NOTHING_TO_FINALIZE`가 먼저 잡으므로, 이 게이트가 실제로 걸리는 건 "영상을 선언하고
  스크린샷·zip만 올린" 모양이다. 프로브=`probe-ingest-media.mjs` (5)(6).
- payload 매핑: `demoScript`→`demo_script`(**촬영 대본** — demoHighlights의 구조화 승격, 2026-08-20.
  `{ steps: [{ goal, where?, action?, text?, expect?, hold? }], skip?, prep? }`, 정규화=`lib/demoScript.ts`:
  스텝≤10·필드 캡·action 화이트리스트(`click|type|drag|scroll|hover|draw|focus|navigate` — **navigate**는
  2026-09-16 추가된 뒤로가기 비트[NF-06]로 `to:"back"` 하나만 받고 **셀렉터가 없는 게 정상**이다:
  `isStepWired`·`isStepSubstantial`이 이 액션만 예외로 통과시킨다. 안 그러면 뒤로가기 한 줄 때문에
  대본 전체가 비전 경로로 떨어진다. `to`는 `toSelector`의 별칭이기도 해서 정규화가 action을 **먼저**
  읽는다 — 순서를 되돌리면 `to:"back"`이 드롭 대상 셀렉터로 새어 들어간다), 형식 어긋난 스텝은 조용히 드랍 후 에코의 `demoScriptSteps`/
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
  응답에 `upserted:true`). 초안 한정이라 공개된 행은 절대 안 건드림(PAT 폭발반경 유지). 제작자
  스크린샷(`_media/`) 썸네일은 thum.io로 안 덮는다. upsert된 행은 파일·미디어 검증 실패 시에도
  삭제하지 않는다(이번 요청이 만든 행만 고아 정리).
- **draftId(2026-09-15)**: payload `draftId`를 주면 URL 대신 **그 초안**을 갱신한다 — zip 경로는 비교할
  URL이 없어 다시 올릴 때마다 새 초안이 생겼고(draftId 없으면 지금도 그렇다), URL을 바꿔 올린 초안도
  그랬다. 확인은 게이트보다 먼저(404 `NOT_FOUND` → 403 `FORBIDDEN` → 공개된 행 409 `NOT_DRAFT`). 갱신은
  `is_draft=true` 조건으로 걸어 확인~갱신 사이에 공개되면 409. URL로 바꾸면 `demo_url`도 교체하고, zip이면
  옛 주소를 새 파일이 검증을 통과한 뒤에 바꾼다. 교체 뒤 새 아티팩트에 없는 옛 파일은 지운다
  (`lib/ingestStore.ts removeStaleFiles` — 공개 버킷이라 남기면 옛 주소로 계속 서빙됨, `_media`·`_upload` 제외).
  2단계 업로드면 1단계가 `_upload/replace.marker`(**교체 표식**)를 남기고, finalize가 이를 **list로**
  확인해 검증이 실패해도 그 초안을 안 지운다(download는 CDN 캐시로 옛 값이 읽힐 수 있음). 서명 URL을
  발급하지 않는 키라 PAT로는 못 만든다. CLI `publish --id <id>`(≥0.1.13) · MCP `publish_to_nookframe`의
  `draftId`. 옛 CLI·MCP도 JSON에 `draftId`를 넣으면 서버까지 그대로 간다. 고쳐달라기 프롬프트
  (`lib/draftFixPrompt.ts`)는 JSON에 `draftId`를 실어서 CLI·MCP·`/publish` 붙여넣기 어느 길로 와도 그 초안을
  갱신한다. AI 프롬프트 3종의 셸 제출 줄은 `--file`이다(npm 0.1.13 발행 확인 뒤 교체 — 먼저 바꾸면 옛 CLI가
  모르는 플래그를 조용히 무시한다).
- **newDraft(2026-09-16, 외부 AI 피드백 NF-16)**: payload `newDraft:true`(CLI `--new`)면 URL 매칭을 건너뛰고
  **늘 새 초안**을 만든다 — 앞 초안을 남긴 채 v2를 올릴 유일한 길이다(기본은 같은 URL이면 말없이 덮어쓰기).
  `draftId`와 같이 주면 400 `BAD_REQUEST`(`newDraftConflict`). 초안 상한 20은 그대로 적용된다.
- 응답: `{ ok, projectId, reviewUrl, isDraft:true, upserted? }`. reviewUrl은 요청 origin 기준.

## 초안 관리 API (요청4) — `/api/ingest/drafts`

전부 PAT 또는 쿠키 인증, **is_draft=true 행만** 다룬다 — 공개된 프로젝트는 이 표면에 없다(목록에서
안 보이고, 수정·삭제는 409 `NOT_DRAFT`). 레이트리밋은 발행과 별도 버킷(`ingest-manage` 60/h).

- `GET /api/ingest/drafts` — 내 초안 목록 `{ ok, count, drafts:[{ id, title, …, reviewUrl }] }`.
- `PATCH /api/ingest/drafts/[id]` — 보낸 필드만 갱신(title/description/builderNote/demoHighlights/demoScript/
  tags/contentType/targetDevice/demoAccess — 검증은 생성 경로와 동일 규칙·동일 게이트). `deployUrl`·`appUrl`·
  `uploads`가 오면 400 `ARTIFACT_IMMUTABLE` — 아티팩트 교체는 publish 재실행(`draftId`로 이 초안을
  지정, URL 초안은 같은 URL로도 됨)이 정규 경로(검증 경로 단일화).
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

## 재촬영 API — `POST /api/ingest/rerecord/[id]` (2026-08-25 루프, 08-26 클라이언트)

영상이 마음에 안 들 때 **사람은 말로 적고, 대본은 AI가 다시 쓴다**(사용자 확정 설계 — 사람이 CSS
셀렉터를 손으로 고치는 제품은 만들지 않는다). 루프 3칸:

1. `POST /api/projects/[id]/rerecord-prompt` (쿠키) — 사람의 불만 + 원본 대본 전문 + 작품 정보 +
   프로젝트 id + 형식 규칙 + 제출 방법 + 자동발급 토큰을 **프롬프트 하나로**(`lib/rerecordPrompt.ts`,
   ko/en). 설계 제약: 재촬영은 **레포 기억이 없는 새 세션의 AI**가 맡을 수 있다 → 맥락을 통째로 싣는다.
2. `POST /api/ingest/rerecord/[id]` (PAT) — 새 대본을 **`pending_demo_script`로만** 받는다. 공개
   데이터(`demo_script`)는 안 건드린다: PAT가 공개 콘텐츠를 갈아치우는 길을 만들지 않기 위해서, 그리고
   촬영비가 나가기 전에 사람 눈을 한 번 넣기 위해서. 대본 게이트(최소 4스텝·실속 3스텝)는 **생성 경로와 동일** —
   재촬영이 품질을 낮추는 길이 되면 안 된다. 레이트리밋 `rerecord` 20/h. 에코 = `{ accepted:
   { demoScriptSteps, demoScriptDropped, note }, next }`.
3. `POST /api/projects/[id]/apply-rerecord` (쿠키) — 소유자가 확인하고 실행. 1회차는 즉시 큐잉(대본
   승격), 2회차부터 `demo_requests(kind=rerecord)`로 관리자 승인.

**클라이언트 표면(08-26)** — 08-25엔 curl뿐이었다. 프롬프트가 셋을 나란히 안내한다:
- MCP 툴 `rerecord_nookframe_demo` `{ id, demoScript, note }` — 공개된 작품에 쓰는 유일한 툴이지만
  대기 상태로만 저장된다. 대본 스키마는 `publish_to_nookframe`과 **같은 상수**(mcp.js `DEMO_SCRIPT_SCHEMA`).
- CLI `nookframe rerecord <id> --json '<json>' | --file <path> [--note …]` (≥0.1.9). `--json`은 봉투
  `{demoScript, note}`와 대본 자체 `{steps:[…]}` 둘 다 받는다(프롬프트가 대본만 주는 경우가 흔하다).
- curl (폴백).
- ⚠️PAT 경로 응답은 **영어 고정**(`shared.ts`: bearer→`getDictionary("en")`, 쿠키=사용자 locale) — AI가
  읽는 표면이라 의도된 것. 한국어로 보인다면 그건 쿠키 경로다.
- 검증: `scripts/probe-rerecord-cli.mjs` 16단언(CLI 3형태·MCP stdio 실물 왕복·게이트·공개 대본 불변).

## 저장 결과 에코 — `accepted` (도그푸딩 C-1)

인제스트는 **틀린 값을 에러 대신 조용히 버린다**: AI 툴 태그는 철자가 `AI_TOOLS`와
안 맞으면 사라지고, `contentType` 오타는 `null`, `demoHighlights`는 500자에서 잘리고, `demoScript`는 형식 어긋난 스텝이 드랍되고,
형태가 어긋난 `demoAccess`는 통째로 없어진다. 이건 "AI가 올리다 실패하는 것보다
일부라도 올라가는 게 낫다"는 의도적 설계다 — 문제는 발행이 성공해도 **무엇이
살아남았는지 알 방법이 없었다**는 것(자체 도그푸딩에서 확인).

그래서 `POST /api/ingest`와 `PATCH /api/ingest/drafts/{id}`는 응답에 `accepted`를
싣는다. 요청 payload가 아니라 **저장 직전(PATCH는 갱신된 행)의 값**으로 조립한다.

- 조립: `app/api/ingest/shared.ts` 의 `buildAccepted()` — 표시 전용, 저장 내용 불변.
- 필드: `title` · `descriptionChars` · `descriptionLines` · `descriptionMaxLineCols` · `descriptionLineCols`(줄별 칸 수,
  09-16 — "3줄 54자"만으로는 어느 줄이 52칸에 걸리는지 몰랐다) · `builderNoteChars` · `demoHighlightsChars` · `demoScriptSteps` · `demoScriptDropped` ·
  `demoHighlightsTruncated` · `tags` · `droppedTags` · `contentType` ·
  `droppedContentType` · `entryUrl` · `scoutAltUrl` · `demoAccess` · `demoAccessDropped` · `targetDevice`.
- 파일 업로드(2단계) 경로는 `finalize` 응답에 `accepted`가 없으므로 CLI가 1단계 것을
  이어붙인다(`cli/src/publish.js`).
- 출력: `cli/src/echo.js` `formatAccepted()` — CLI 콘솔·MCP 툴 결과 공용. 한글 2칸
  폭을 계산해 열을 맞춘다. **구버전 서버는 `accepted`를 안 주므로 빈 배열로 조용히 물러난다.**
- `drafts list`도 초안마다 태그·분류·시연 핵심 유무를 함께 출력한다(사후 확인 수단).

### 대본 점검표 — `accepted.scriptReview` (2026-09-04)

같은 프롬프트라도 AI마다 대본 품질이 다르다(09-03 실측: 소넷5=6스텝·조작 1·라이브 확인 0회,
오퍼스5·페이블5.1=8스텝·셀렉터 실측). 약한 AI는 프롬프트의 부탁은 흘려듣지만 **기계가
돌려주는 판정은 따른다**. 그래서 400으로 막을 만큼은 아닌 대본에도 "어디가 약한지"를
응답에 실어 같은 턴에 고쳐 다시 올리게 한다(같은 URL 재푸시 = upsert). 저장은 막지 않는다.

- 조립: `lib/demoScriptReview.ts`(순수 통계 + 셀렉터 확인) → `shared.ts` `buildScriptReview()`(문장).
  발행·초안 PATCH·재촬영 세 입구 공통. 자동 촬영이 없는 경우(영상 동봉)엔 아예 없다.
- 숫자: `steps` · `wired`(셀렉터+action) · `interactive`(click/type/drag/draw) · `withExpect` · `withHold` · `hasSkip` · `hasPrep`.
- `film`(2026-09-16, 외부 AI 피드백 NF-05/17): 예상 촬영 길이 `{seconds, budget:30, cutFromStep}`.
  `lib/demoScriptReview.ts estimateFilm` — 러너 페이싱(`local-runner/replay.ts`·`camera.ts`)을 옮겨 온
  어림 계산이다(커서 활강 1.0초 · 클릭 전 정지 0.18 · 타이핑 0.055/자 · focus 0.7 · 기본 hold 0.9,
  hold는 스키마대로 0.5~4로 자름). 예산 30초 = `MAX_VIDEO_SEC` 34 − 인트로 3 − 꼬리 1.1. 넘으면 힌트
  `filmTooLong`이 **몇 번째 스텝부터 못 들어가는지**를 말한다. 셀렉터 대기·느린 페이지는 더 걸리므로
  **하한**으로 읽는 값이고, 러너 상수가 바뀌면 여기도 손으로 맞춘다(lib은 러너를 import 하지 않는다).
- `selectors`: 서버가 진입 URL(demoAccess까지 합친 주소, `composeProbeUrl`)의 HTML을 **한 번**
  받아 `#id`·`.class`·태그·`[attr=…]`가 있는지 센다. HTML 한 장은 로봇의 **첫 화면**뿐이라
  `selectorsOf()`가 셀렉터를 둘로 가른다(2026-09-15): `entry` = 앞에서부터 첫 "화면을 바꿀 수
  있는" 스텝까지(focus·scroll은 같은 화면으로 보고 넘어간다, 그 스텝과 drag 도착지 포함) — 이것만
  판정한다. 그 뒤 스텝의 셀렉터는 다른 화면에 있는 게 정상이라 `later[]`로만 싣는다.
  → `{status:"checked", checked, found, missing[], unparsed[], later[]}`(앞의 넷은 첫 화면 기준).
  "확인 불가"로 답하는 경우 — `skipped/js-rendered`: script 있음 + 본문 80자 미만(또는 300자 미만·
  id/class 5개 미만) · `skipped/no-match`: 첫 화면·뒤 화면 통틀어 하나도 안 맞음(JS가 그리거나 다른
  화면으로 넘어가는 페이지) · `skipped/no-entry-selectors`: 첫 화면에 판정할 셀렉터가 없음(HTML을 받지
  않는다). 못 찾았다고 잘못 말하면 AI가 멀쩡한 셀렉터를 고친다 — 09-15 스킨로그(`/demo`가 홈으로
  넘어가는 Next.js 앱, 첫 HTML 본문 4자·class 5)가 옛 판정에서 "0/8 없음"을 받았고 실제론 8/8이었다.
  fetch는 `lib/ssrf.ts safeFetch` 경유·6초·1MB 캡, 실패는 `skipped/fetch-failed` — 절대 발행을 막지 않는다.
- `hints[]`: 발화 조건 = 6스텝 미만 · 조작 2개 미만 · 셀렉터/expect 빠진 스텝 · skip 없음 ·
  첫 화면 셀렉터 누락("JS가 뒤에 그리면 정상"을 먼저 말한다) · 확인 불가(js-rendered·no-match 공용,
  "오류 아님, 이것만 보고 셀렉터를 바꾸지 말 것"). PAT=영어, 세션=쿠키 언어.
- CLI(`echo.js formatScriptReviewWarnings`)는 hints를 안 찍고 숫자로 영어 문장을 만든다 —
  서버 hints는 원시 JSON을 읽는 AI용. 점검표 출력은 `nookframe@0.1.10`부터, 첫 화면/뒤 화면 문구는
  0.1.13부터다. 판정 자체는 서버에 있어 배포 즉시 모든 CLI에 적용된다(옛 CLI는 js-rendered만 한 줄로
  말하고 no-match는 조용히 넘어간다).
- 검증: `node scripts/probe-script-review.mjs`(prod E2E) + `npx -y tsx scripts/probe-script-review-unit.mts`(순수 함수).

## 관련 파일

- 마이그레이션: `supabase/migration_api_ingest.sql` (api_tokens · is_draft · RLS 정책 교체) ·
  `supabase/migration_connect_code.sql` (connect_codes — 페어링 코드)
- libs: `lib/apiToken.ts` · `lib/connectCode.ts` · `lib/upload-safety.ts` · `lib/projectTaxonomy.ts` · `lib/connectSnippets.ts`
- API: `app/api/ingest/route.ts` · `app/api/ingest/finalize/route.ts` · `app/api/ingest/drafts/*`
  (공용 인증·URL 게이트=`app/api/ingest/shared.ts`) · `app/api/tokens/route.ts` · `app/api/tokens/[id]/route.ts` ·
  `app/api/connect/code/route.ts` · `app/api/connect/exchange/route.ts`
- UI: `components/dashboard/ConnectPanel.tsx`(연결 패널) · `ProjectsTab.tsx`(초안 검토·발행) · `app/publish/*`
- CLI/MCP: `cli/` (배포명 `nookframe`)
- 검증: `scripts/probe-api-ingest.mjs`


## 발행 게이트 3종 (인제스트가 저장 전에 되돌려보내는 것)

`/api/ingest` POST와 `PATCH /api/ingest/drafts/:id`는 zip·URL 처리보다 **먼저** 세 가지를
검사한다. 대본·로그인의 면제 조건은 하나뿐 — 직접 만든 시연 영상(`video` 파트 또는
`uploads: ["video"]`)을 준 경우다(자동 촬영 자체를 건너뛴다). 대상 화면은 촬영이 아니라
"어떻게 보여줄까"의 질문이라 **영상 동봉도 면제가 아니고**, 대본·로그인 게이트 뒤에 검사한다.

| 게이트 | 코드 | 통과 조건 |
|---|---|---|
| 촬영 대본 (2026-08-25) | `SCRIPT_REQUIRED` · `SCRIPT_TOO_THIN` | `demoScript.steps` ≥ 3 |
| 로그인 답변 (2026-08-27) | `DEMO_ACCESS_REQUIRED` | `demoAccess`가 `url` · `noLogin` · `impossible` 중 하나 |
| 대상 화면 (2026-09-15) | `TARGET_DEVICE_REQUIRED` | `targetDevice`가 `mobile` · `desktop` 중 하나(대소문자 무시). 수정 경로로 비우기도 400. 검증: `node scripts/probe-target-device-gate.mjs` |

로그인 게이트를 만든 이유는 실패가 **실패로 보이지 않기 때문**이다. 로그인해야 기능이
도는 앱을 그냥 올리면 로봇은 로그인 화면이나 빈 껍데기를 찍는데, 화면은 떴으므로
blank 가드도 통과하고 워커도 성공으로 마킹한다. demoAccess가 선택 항목이던 동안
발행 AI는 이 칸을 그냥 비웠다. 이제 셋 중 하나로 **답을 해야** 저장한다.

### 사전 검사 — `POST /api/ingest?dryRun=1` (2026-09-16 사용자 확정, CLI `nookframe check`)

게이트는 "거절이 곧 품질을 올리는 순간"이지만, 거절을 알려면 **올려 봐야** 했다. 사전 검사는
같은 라우트에 `?dryRun=1`을 붙여 **저장·업로드·서명 URL 없이 판정만** 돌려준다.

- **왜 서버인가**: 게이트 판정은 전부 `lib/`에 있고 `cli/`는 레포 코드를 import할 수 없다 —
  CLI에 다시 구현하면 상수 사본이 셋이 되어(이미 `film` 상수·`AI_TOOLS` enum이 손동기화 중) 검사와
  발행의 답이 갈라진다. 사용자 결정: 로컬 재구현·혼합안 대신 **서버 드라이런**.
- **자리**: `app/api/ingest/route.ts` 6.5단계 — 위는 전부 읽기 전용(인증·게이트·URL 게이트·셀렉터
  확인·갱신 대상 찾기), 아래부터 쓰기다. 그 사이가 "발행하면 무슨 일이 일어나나"를 다 아는 유일한 지점.
- 응답: `{ ok, dryRun:true, wouldUpdate, draftId?, accepted }` — `accepted`는 발행 응답과 **같은 조립**
  (`scriptReview`·`film`·`descriptionLineCols` 포함). `wouldUpdate`는 "같은 URL의 초안을 덮어쓸 것"을
  미리 말해 준다(NF-16의 불만이 말없는 덮어쓰기였다). `projectId`·`reviewUrl`은 없다.
- 레이트리밋: 쿼리로 온 검사는 **별도 버킷** `ingest-check` 60/h — 검사 몇 번에 발행 예산(20/h)이
  마르면 "올리기 전에 확인해라"와 어긋난다. 쿼리를 못 쓰는 호출자용으로 `payload.dryRun:true`도
  받지만 그 경로는 발행 버킷을 한 번 쓴다(저장은 여전히 안 한다).
- 검사하지 못하는 것: **파일 자체**(zip 안전성·미디어 매직바이트 — 올리지 않으므로)와 **초안 개수
  상한**(쓰기 분기에서 센다). CLI·MCP는 파일을 올리는 대신 `uploads` **선언만** 실어 보낸다 —
  bundle 선언은 URL 없는 폴더 발행이 아티팩트 게이트를 통과하는 근거이고, video 선언은 대본·로그인
  게이트의 유일한 면제 조건이라, 그래야 발행과 같은 답이 나온다.
- 클라이언트: CLI `nookframe check`(publish와 **같은 입력 조립** `buildPublishPayload`, 거절이면
  서버 메시지를 그대로 찍고 **종료코드 1**) · MCP 툴 `check_nookframe_payload`. 옛 서버에 붙어
  `dryRun` 응답이 없으면 "검사가 아니라 발행됐다"고 경고하고 초안 id·삭제 명령을 알려준다.
- 검증: `node scripts/probe-ingest-dry-run.mjs`(prod E2E 18단언 — 게이트 5종 동일 코드·행 0건 유지·
  서명 URL 미발급·wouldUpdate·공개 행 409) + `npm test`의 `probe-cli-input.mjs` (13a~13c).

판정 함수는 `lib/demoAccess.ts`의 `demoAccessAnswered()` 하나뿐이고, 생성·수정 두
라우트가 같은 함수를 쓴다(수정 경로를 막지 않으면 "게이트를 통과한 뒤 도로 비우는"
우회가 된다). 에코(`accepted.demoAccess`)는 세 답을 각각 `"/demo"` · `"no-login"` ·
`"impossible"`로 구별해 돌려준다. 검증: `node scripts/probe-demo-access-gate.mjs`(prod E2E 18단언).
