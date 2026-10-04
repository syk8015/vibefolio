# 소개 영상 (Intro Film) — 설계와 작업 계획

> 상태: **1~6단계 배포됨 (2026-10-02)** — 엔진·입구(ingest·초안 PATCH)·명함 PC/작품 페이지 재생·검토 창 고르기·워커 mp4·AI 안내. 온습도계를 대본 방식으로 옮겨 실서버 확인. claudeusage·ClaudeHelp도 대본 방식으로 공개(10-02). **틀 버전 4 (10-03)**: 장면 짝마다 다른 전환(이어 붙이기·자르기·옆·아래·파고들기·색 판·암전), 산호색 점 하나가 영상 내내 이어짐, 계기판, 굴러가는 숫자, 손그림 동그라미, 흐름 신호, 터지는 끝 — awesome-opus5-5-videos 48편 분석에서 골랐다(조사 원본은 레포 밖 `nookframe-research-2026-10-02/moat/F·G`). 남은 것: 공개된 작품의 스타일 바꾸기 화면, 명함 무대(16:10)에서 계기판 좌우가 잘림(사이트 개편 때). 조사 원본은 레포 밖
> `~/Desktop/nookframe-작업물/nookframe-research-2026-09-28/arch-2026-10-01/` (A·B·C + SYNTHESIS).

## 한 줄

화면이 없는 작품(CLI·백엔드·기기·접속 코드로 잠긴 앱)은 로봇이 찍을 게 없다. 그런 작품은 AI가
**장면 대본(JSON)** 을 보내고, Nookframe이 정해 둔 **영상 틀**로 보는 사람 화면에서 **바로 재생**한다.
영상 파일(mp4)은 맥 워커가 뒤에서 만들어 썸네일·공유·폰 화면에 쓴다.

## 영상 틀(장르) — 2026-10-04부터 지금의 그림 방식

- 옛 그림(SVG 한 벌 + 글자·분위기 9조합, `render.ts`·`styles.ts`)은 지웠다. 사용자 평가: "세 작품이 같은 영상 같았다 · 기계적 · 사람이 만든 것 같지 않다".
- 지금은 **틀마다 그 물건의 세계가 하나씩** 있는 캔버스 틀이다(`lib/introFilm/genres/`). 틀은 `make(work, {seed, fonts}) → { duration, starts, render(g, t) }`이고 render는 t의 순수 함수다(npm test가 폴더째 검사).
- 들어온 틀 = 필름 실험실 24개 시안 중 사용자가 "멋있어"를 준 것만: **영수증(1등) · 터미널 · 게임기 LCD**. 실험실 원본·기준: `~/Desktop/nookframe-작업물/film-lab/`(CONTRACT.md), `.../nookframe-research-2026-10-04/film-style/STANDARD.md`.
- 고르기: AI는 틀 이름을 보내지 않는다. 주인이 검토 창 [영상 틀]에서 고르고(`introFilm.genre`), 안 고르면 작품 id로 정해진 추천(`recommendGenre`). 틀을 바꾸면 지문이 바뀌어 워커가 다시 만든다.
- 틀 늘리기: `genres/<id>.ts` + `ids.ts`의 `GENRE_IDS` + `index.ts`의 `GENRES` + 사전 `reviewIntroGenres` + 글꼴(`components/introFilm/fonts.ts`의 논리 이름). 한국어 판이 깨지지 않는지(두 언어 모두) 꼭 본다.

## 정한 것 (사용자 결정)

- 화면 있는 앱은 지금처럼 로봇 촬영. 대본 영상은 **화면 없는 작품 전용** (10-01).
- 스타일 3종(손그림 · 큰 숫자 · 시네마틱) + **섞기**를 첫 배포에 한꺼번에 (10-01, 범위 축소 거절).
- 검토 창은 AI 추천 스타일로 열린다 (09-30).
- 공개 뒤 스타일을 바꾸면 화면은 즉시 바뀌고 mp4만 뒤에서 다시 만든다 (10-01, 09-30 "재촬영"을 대체).
- 글자·숫자는 검토 창 장면 목록에서 직접 고치고, 장면 순서·그림 같은 큰 변경은 [AI에게 고쳐달라기] (09-30).
- 문장 글꼴은 숫자와 같은 둥근 고딕. 기울인 세리프(손글씨 느낌)는 시네마틱에 쓰지 않는다 (10-01).
- 모든 장면에 정직 표시: 예시 값이면 "Sample data", 실측이면 출처 (10-01).
- 화면 없는 작품 1차 대상: claudeusage, ClaudeHelp (09-29·09-15 보류 결정을 10-01에 뒤집음).

## 구조 (조사 결론)

1. **장면 대본 = 칸 채우기.** AI는 정해진 장면 종류의 칸 값만 보낸다. 배치·움직임은 틀 몫.
   자유 타임라인 금지 (Plainly·JSON2Video·supercut 방식).
2. **스타일 = 같은 장면 구조 위의 토큰 묶음** (색·글꼴·움직임 곡선·전환·질감·카메라).
3. **섞기 = 글자 + 분위기 두 줄 고르기** (10-02). 글자(글꼴·배치·등장)와 분위기(색·빛·질감·카메라)를 따로 골라 9가지 조합.
   비율 섞기는 사용자가 "너무 복잡하다"고 해서 쓰지 않는다.
4. **한 묶음(번들)을 세 곳에서** — 검토 창 미리보기 · 명함/작품 페이지 재생 · 워커 mp4 렌더가
   같은 코드라서 미리보기와 결과가 어긋나지 않는다. 번들 해시를 결과와 함께 저장.
5. **결정적 렌더** — `render(t)`는 시간 t의 순수 함수. 틀 안에서 `Date`·`requestAnimationFrame`
   타이머·시드 없는 `Math.random`·CSS 애니메이션 금지. 글꼴은 자체 호스팅(woff2)으로 묶는다.
6. **안전 구역** — 표면마다 글자를 두지 않을 곳을 틀이 안다: 명함 무대(왼쪽 아래 제목판·말풍선,
   16:10 양옆 잘림), 작품 페이지, 9:16(위 160·아래 480·양옆 120px). 10-01 실서버에서 본 겹침·잘림의 근본 해결.

## 데이터 모양 (초안)

```jsonc
"introFilm": {
  "style": { "text": "bignum", "mood": "cinematic" },               // 글자 + 분위기
  "scenes": [
    { "kind": "hook",     "value": "68%", "label": {"en":"My bathroom","ko":"우리 집 욕실"},
                          "line": {"en":"Always too damp.","ko":"늘 너무 습해요."}, "data": "sample" },
    { "kind": "items",    "items": [{"value":"68%","label":{...}}, ...], "line": {...}, "data": "sample" },
    { "kind": "flow",     "nodes": [{"label":{...}}, ...], "line": {...} },
    { "kind": "terminal", "command": "claudeusage value --all", "output": ["..."], "data": "sample" },
    { "kind": "alert",    "device": "phone", "title": {...}, "body": {...}, "data": "sample" },
    { "kind": "stats",    "stats": [{"value":"22","unit":"types","label":{...}}, ...], "data": "measured", "source": "web/lib/alerts.ts" },
    { "kind": "ending",   "line": {...}, "name": {...} }
  ]
}
```

- 장면 종류(1차): `hook` · `story`(한두 줄 사연) · `items`(1–6개 값 줄) · `flow`(2–5 단계 흐름) ·
  `terminal`(명령 + 출력 — CLI용, claudeusage에 필요) · `alert`(폰 알림/명령 창 알림) · `stats`(2–4개 숫자) · `ending`.
- 길이 20–32초, 장면 4–8개. 모든 글은 ko·en 두 벌 (두 언어 규칙과 같음).
- `data`: `sample`(예시) | `measured`(실측, `source` 필수). 장면 구석 표시가 이 값으로 바뀐다.

## 작업 단계

### 0단계 — 목업과 규격 확정 (착수 전 사용자 확인)
- 검토 창 목업(Design 캔버스 `IntroStyleReview` 보드 갱신): 스타일 3장 + **섞기 칸**(축별 고르기 + 비율 막대) + 장면 목록 직접 고치기.
- 장면 종류 × 스타일 3종 견본 한 장씩(온습도계 2차를 기준으로 손그림·시네마틱 판 추가).
- 확인할 결정: 섞기 칸 모양, 폰 화면 처리(아래 "폰" 참조).

- 0단계 시안(움직이는 검토 창): https://claude.ai/artifact/JBGocmNdCYppQ8C4MaoZMV — 엔진 원형 코드가 여기 있다(1단계에서 TS로 옮김).
  **고르기 = 두 줄 (10-02 사용자 결정, 비율 막대·항목별 칸은 복잡해서 폐기)**: "글자"(글꼴·배치·등장 방식) 한 줄 + "분위기"(색·빛·질감·카메라) 한 줄,
  각각 손그림·큰 숫자·시네마틱 중 하나. 같으면 순수 스타일, 다르면 섞인 스타일(3×3=9가지). 처음엔 AI 추천 조합. 각 칸 미리보기는 "그걸 고르면 이렇게"를 보여준다.
  큰 숫자 등장 = 선 뒤에서 올라오는 마스크(2차에서 좋다고 한 방식), 시네마틱 = 흐림에서 또렷, 손그림 = 살짝 기울며 그려짐.

### 1단계 — 영상 틀 엔진 (`lib/introFilm/`)
- `schema.ts` 장면 대본 타입 + 검사(`introFilmIssue` — 글자 길이, 장면 수, 길이, 정직 표시, ko·en).
- `styles.ts` 토큰 3벌(hand · bignum · cinematic) + `resolveStyle({text, mood})` (글자 쪽: type·등장 / 분위기 쪽: color·texture·카메라).
- `render.ts` `createFilm(svg, spec, {surface, locale})` → `{duration, render(t)}`. 온습도계 2차 코드를 장면 종류별 모듈로 나눈다.
  장면마다 3스타일 배치(손그림은 흔들리는 선·종이 질감, 큰 숫자는 굵은 고딕·면, 시네마틱은 어둠·빛·카메라).
- `safeZones.ts` 표면별 금지 구역 + 배치 검사.
- 글꼴 자체 호스팅: `public/fonts/intro/` (Bricolage Grotesque, JetBrains Mono, Inter, 손그림용 1종) — 구글 의존 제거(렌더 일치).
- 프로브(`npm test`): `probe-intro-film-unit`(검사·섞기·시간 양자화) + 금지 API 정적 검사(틀 파일에 Date/rAF/random 없음).

### 2단계 — 저장 칸과 입구 (ingest)
- SQL `supabase/migration_intro_film.sql`:
  `intro_film jsonb` (공개 칸, 사용자 수정 가능) + `intro_render jsonb` (워커 전용 — `{hash, video, poster, at}`, guard 트리거에 추가).
  `lib/projectColumns.ts` PUBLIC에 둘 다, `OPTIONAL_COLUMN_MIGRATION`에 추가.
- `app/api/ingest/route.ts`: `introFilm` 파싱·검사(dryRun 포함). **`NO_ARTIFACT` 통과 근거**에 introFilm 추가,
  대본·로그인 게이트 면제(`hasOwnVideo`와 같은 자리), 언어 게이트는 대본 글 기준.
  인제스트는 여전히 `demo_*` 칸을 쓰지 않는다(불변식).
- 초안 PATCH(`app/api/ingest/drafts/[id]`)와 원격 MCP `update_nookframe_draft`에 introFilm.
- 주인 수정용 서버 경로 `PATCH /api/projects/[id]/intro-film` (쿠키·주인 확인·같은 검사) — 사용자 키 직접 update는 검사를 건너뛰므로 쓰지 않는다.
- `schema/publish.json` → `npm run schema:build` (CLI·MCP 도구 설명 동시 갱신). 파일 첨부가 필요 없으니 **원격 MCP에서도 된다.**
- 프로브: `scripts/probe-intro-film-gate.mjs`(실서버 dryRun), `probe-project-columns` 통과.

### 3단계 — 재생 (명함 · 작품 페이지)
- `components/IntroFilmPlayer.tsx`: 시계로 `render(t)`를 돌리는 플레이어. 화면 밖이면 멈춤,
  줄임 모드(reduced motion)면 대표 장면 한 장, 보는 사람 언어로 글 선택.
- `TheaterStage` `LivePreview` 우선순위 맨 앞에 intro_film(표면 `card` 안전 구역), 작품 페이지 `WatchPlayer` 쪽도.
- **폰**: 폰 화면은 09-27부터 동결 → 폰은 지금 경로 그대로 워커가 만든 mp4를 `demo_video_url`로 보여준다(코드 변경 없음).
  mp4가 생기기 전엔 포스터. 데스크톱만 실시간 재생.
- OG·썸네일: 워커 포스터를 `thumbnail`/포스터 경로로.

### 4단계 — 검토 창
- `DraftReviewModal`: intro_film이 있으면 왼쪽 미리보기 = `IntroFilmPlayer`(재생 막대·장면 이동),
  오른쪽 = 글자·분위기 두 줄(AI 추천 표시) + 장면 목록(ko/en 탭, 글자 직접 고치기) + [AI에게 고쳐달라기](`lib/draftFixPrompt.ts`에 대본 문맥).
- 저장은 2단계의 서버 경로. **미니멀 작업 세션과 겹치는 파일이라 착수 전에 그 세션과 맞춘다.**
- 공개: `handlePublishDraft`가 intro_film이면 촬영 대신 **렌더 요청**을 건다.

### 5단계 — 워커 렌더 (`local-runner/`)
- 렌더 전용 페이지 `app/intro-render/[id]` (promo-record와 같은 방식, 공개 칸만 읽음).
- 큐는 기존 `projects.demo_build_status`(request_demo RPC·할당량·일시정지 그대로)에 `kind: intro` 구분.
- 렌더: 준비 확인(글꼴·이미지 decode·네트워크 끝) → 프레임 구간 K개 병렬 캡처(JPEG) → 페이지 안 흐림(서브프레임 대신) → ffmpeg 이어붙임 → 포스터.
  목표: 30초 영상 3분 안(맥 실측으로 확정).
- 업로드는 기존 `/api/worker/assets` 서명 URL, `done`에서 `demo_video_url`(폰·공유용) + `intro_render.hash` 기록.
  입력 해시(틀 버전 + 스타일 + 대본)가 같으면 다시 안 만든다.
- 프로브: `local-runner/probe-intro-render.ts`.

### 6단계 — AI 안내 (연결 프롬프트 · 스키마 설명)
- "찍을 화면이 없으면 introFilm" 판단 규칙, 장면 쓰는 법(사연은 주인 말로, 숫자는 코드·주인 확인으로만, 예시 값은 sample),
  금지(실제 주소·키·사람 이름·생활 패턴). 인터뷰 질문은 지금 필수 3개 그대로.
- CLI 버전 올림 → **`npm publish`는 사용자가 한다.**

### 7단계 — 배포와 실전
1. 사용자: SQL 적용 → 푸시 → 실서버 확인(헤드리스: 명함 en/ko, 작품 페이지, 검토 창, 워커 렌더 1편).
2. 온습도계를 새 방식(대본)으로 옮겨 겹침·잘림이 사라졌는지 확인.
3. claudeusage · ClaudeHelp를 각 프로젝트 세션에서 **실제 흐름으로** 올림 → 사용자 [공개하기].
   ClaudeHelp: Claude 로고·공식 색 금지, "Not affiliated with Anthropic".
4. 최종 점검(명함 작품 3개, 두 언어, 폰 mp4, 공유 썸네일) → 마무리.

## 위험과 대응
- **검토 창 충돌**: 미니멀 세션이 같은 파일을 고칠 수 있음 → 4단계 전에 조율, 우리 변경은 패널 단위로 분리.
- **폰 동결**: 폰은 mp4 경로로만. mp4 전엔 포스터.
- **맥이 꺼져 있을 때(배치 모드)**: 데스크톱 재생은 영향 없음, 폰·썸네일만 늦어짐.
- **정직**: 예시 값이 실측처럼 보이지 않게 장면마다 표시. 숫자는 출처 없으면 sample.
- **결정성 깨짐**: 금지 API 정적 검사 + 미리보기/렌더 같은 번들.
