# 폰 → 컴퓨터 넘기기 (desktop handoff) — 설계

2026-09-23 확정 흐름. 조사 근거: `~/Desktop/nookframe-research/mobile-to-desktop-bridge-2026-09-23.md`
(표준 = Framer·Ableton의 "Email me a link" 칸 하나).

## 왜

광고는 폰(릴스)에서 보고, 올리기는 컴퓨터의 AI 도구에서 한다. 그 사이에서 사람이 사라진다.
폰에서 기억해 달라고 기대하지 않는다 — 폰에서 이메일 하나만 받고, 우리가 받은편지함으로 컴퓨터까지 찾아간다.

## 사용자 흐름

**폰 (10초)**
1. 릴스 링크 → 인스타 앱 안 브라우저로 `/` (랜딩 그대로).
2. 폰 폭에서는 위 메뉴의 [시작하기]가 `/send`로 간다(PC 폭은 지금처럼 `/signup`).
   - ledger 08-19 "폰 시작하기는 ⋯ 메뉴 밖 유지"는 그대로 — 자리·글자는 두고 **가는 곳만** 바뀐다.
3. `/send`: 제목 "컴퓨터에서 이어서 하세요" · 한 줄 설명(Nookframe은 컴퓨터의 AI 도구로 올린다) ·
   이메일 칸 · 체크박스 "(선택) 내일 한 번 더 알려주기"(기본 꺼짐) · [내 컴퓨터로 보내기] · Turnstile.
   - 아래 작은 링크: "지금 여기서 가입할래요 →" `/signup` (폰에서 가입하려는 사람을 막지 않는다).
4. 보내면 "보냈어요! 컴퓨터에서 메일을 열어 주세요" 화면. 끝. 비밀번호·구글 로그인 없음.

**컴퓨터 (나중에, 약 3분)**
5. 메일 제목 "Your Nookframe link — from your phone"(ko: "폰에서 보낸 Nookframe 링크"). 본문은 버튼 하나 +
   "nookframe.com 을 직접 쳐도 돼요" + "요청한 적 없으면 무시하세요".
6. 버튼 → `/signup?h=<handoff id>&utm_source=…&utm_medium=…&utm_campaign=…`
   - 이메일이 채워진 가입 화면. 기본은 **6자리 코드 가입**(`EmailCodeForm`, 01b0bac) — 같은 컴퓨터 브라우저에서
     요청하고 여니 끊길 일이 없다. 비밀번호 가입도 그대로 고를 수 있다.
7. 가입 → 온보딩(아이디) → 연결 창 → AI에 한 줄 붙여넣기 → 초안 → [공개하기]. 기존 흐름 그대로.
8. 메일을 안 열었고 체크박스에 동의했으면 다음 날(20~44시간 뒤) 알림 메일 **딱 1번**.

## 눈에 안 보이는 부분 — 광고 출처 잇기

- 폰에서 보낼 때: 폰의 first-touch(utm·referrer, `lib/analytics-client.ts`)를 요청과 같이 저장 +
  서버 이벤트 `handoff_requested`.
- 메일 링크에 utm을 다시 붙인다 → 컴퓨터가 처음 온 브라우저면 `FirstTouch`가 그대로 잡는다.
- 링크의 `h`는 컴퓨터 localStorage `nf_handoff`에 저장 + `handoff_opened`(서버에서 opened_at 기록).
  컴퓨터가 예전에 사이트를 본 적 있어 first-touch가 이미 있어도, 온보딩의 `signup_completed`에
  `handoff` id와 폰 쪽 utm을 실어 보내 이어진다(폰 출처가 우선).
- 관제탑: "폰→PC  요청 N · 메일 열림 N · 가입 N"을 캠페인별로.

## 서버

**표** `desktop_handoffs` (새 SQL `supabase/migration_desktop_handoffs.sql`)
- `id uuid pk` · `email text` · `locale text` · `remind boolean` · `first_touch jsonb`
- `created_at` · `opened_at` · `reminded_at`
- RLS 켜고 정책 0개 = 관리자 권한 열쇠로만 읽고 쓴다(익명·사용자 키는 못 봄).
- 30일 지난 행은 알림 크론이 지운다(이메일을 오래 들고 있지 않는다).

**주소**
- `POST /api/handoff` — 이메일·remind·first_touch·locale·Turnstile 토큰. 검사: Turnstile, IP당 1시간 5번,
  같은 이메일 24시간 1번(해시로 rl 버킷). 같은 이메일 재요청이면 **새로 보내지 않고 성공처럼** 답한다
  (남의 주소로 메일 폭탄 방지 + 가입 여부 새지 않게).
- `GET /api/handoff/[id]` — 가입 화면이 이메일을 채우려고 부른다. 30일 안 된 행만. 부르면 opened_at 기록.
- `GET /api/cron/handoff-reminders` — 크론 비밀값 확인(기존 health 크론과 같은 방식). 1시간마다.
  remind=true·opened_at 없음·reminded_at 없음·20~44시간 전 → 알림 1통 + reminded_at. 30일 지난 행 삭제.
- 실패 응답은 `apiError()`.

**메일** — `lib/email.ts` `sendEmail`, 템플릿은 `lib/email-templates.ts` 옆에 ko/en.
- 첫 메일 = 본인이 요청한 거래성 메일: 제목·첫 줄에 요청한 링크, 광고 문구 없음(CAN-SPAM).
- 알림 메일 = 체크박스 동의자만, 1회, "더는 안 보내요" 한 줄(영국 PECR).

## 지키는 것

- 인제스트·데모 파이프라인과 무관. 인증도 기존 `EmailCodeForm`/비밀번호 가입을 그대로 쓴다(새 로그인 방식 안 만듦).
- 메일 링크로 **자동 로그인하지 않는다** — 링크가 전달·유출되면 계정이 넘어간다. 가입 화면을 채워 줄 뿐.
- `h`로 알 수 있는 건 그 행의 이메일 하나뿐. id는 추측 불가 uuid.

## 사용자가 직접 해야 하는 것

1. Supabase SQL 편집기에서 `migration_desktop_handoffs.sql` 실행.
2. cron-job.org에 `/api/cron/handoff-reminders` 1시간 간격 등록.
3. Resend 한도 확인 — 인증 메일과 같은 계정을 쓴다(무료 요금제는 하루 100통).

## 검증

- `scripts/probe-handoff.mjs`(prod E2E): 요청→행 생성·메일 1통, 같은 이메일 재요청=조용한 성공·메일 0,
  IP 한도, `GET` 채움·opened_at, 익명 키로 표 읽기 거부, 크론 비밀값 없으면 401.
- `npm test`·typecheck·lint·`npm run font:subset`.
- 육안: 폰(인스타 앱 안 브라우저 포함)에서 `/send` → 컴퓨터에서 메일 열기 → 가입까지 nookframe.com으로.

## 나중 (이번 범위 밖)

- 폰에서 아이디 선점(조사 TOP 4), Meta 인스턴트 폼·Conversions API(TOP 5), 가입 폼 "어디서 알게 됐나요?".
