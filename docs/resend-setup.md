# Resend 이메일 — 스위치 절차 (T4)

코드는 전부 배선돼 있고 `RESEND_API_KEY`가 없으면 **전 경로 무동작**(no-op)이다.
R2와 같은 게이트 패턴 — 키를 넣는 순간 켜진다. 발신기는 `lib/email.ts`(SDK 없이
HTTPS 1콜, 절대 throw 안 함), 템플릿은 `lib/email-templates.ts`.

## 배선된 발신 경로

| 트리거 | 수신자 | 템플릿 |
| --- | --- | --- |
| 시연 완성 (워커) | 프로젝트 소유자 | demo-ready: watch 링크 + 포스터 + Share Kit 안내 |
| 시연 실패 login-gated/timeout/error (워커) | 소유자 | demo-failed: 대시보드 배지와 동일 카피(`DEMO_FAILURE_COPY`) |
| 시연 실패 interrupted (워커 기동 복구) | 소유자 | demo-failed |
| 시연 실패 stuck (health 크론 리핑) | 소유자 | demo-failed |
| 크레딧 소진 (워커, P0.5) | 관리자 | admin-alert: held 잡 + 해제 절차 포인터 |
| 워치독 경보 (health 크론) | 관리자 | admin-alert: **6시간/키 디듑** (`system_status.alerts_state`) |
| 한도 초과 held (trigger-demo) | 관리자 | admin-alert: 승인 콘솔 CTA |
| 재촬영 요청 접수 | 관리자 | admin-alert: 요청 내용 + 승인 콘솔 CTA |

raw 에러는 메일에 싣지 않는다(기술 정보는 대시보드 팝오버 토글). 유저 메일은
소유자 주소(`auth.admin.getUserById`)로만 나간다.

## 스위치 순서

### 1. Resend 계정 + API 키 (5분)
1. https://resend.com 가입 (무료: 3,000통/월, 100통/일 — 현 볼륨 여유).
2. API Keys → Create → Full access 키 생성.
3. 키를 두 곳에:
   - 루트 `.env.local` → `RESEND_API_KEY=re_...` (Next dev + 로컬 워커 공용 — 워커는 루트 .env.local을 읽는다)
   - Vercel → Project → Settings → Environment Variables → `RESEND_API_KEY` (Production)

### 2. 도메인 인증 전 스모크 테스트 (선택, 2분)
도메인 인증 전엔 Resend 기본 발신자만 쓸 수 있고 **본인 계정 주소로만** 배달된다:
```
EMAIL_FROM=Nookframe <onboarding@resend.dev>
```
을 `.env.local`에 임시로 넣고 아무 발신 경로 하나(예: 시연 1건)를 태워 수신을 확인.
확인 후 이 줄은 **삭제**(기본값 `Nookframe <notify@nookframe.com>`으로 복귀).

### 3. 도메인 인증 — nookframe.com (10분 + 전파 대기)
1. Resend → Domains → Add Domain → `nookframe.com` (리전 아무거나, 가까운 곳).
2. Resend가 제시하는 레코드를 **그대로** Cloudflare DNS에 추가 (보통 3개):
   - TXT `resend._domainkey` — DKIM
   - TXT `send` — SPF (`v=spf1 include:amazonses.com ~all` 형태)
   - MX `send` — `feedback-smtp....amazonses.com`, priority 10
   - Cloudflare에서 프록시 개념이 없는 레코드 타입이라 그대로 저장하면 된다 (기존 회색 구름 정책과 충돌 없음).
3. (권장) DMARC: TXT `_dmarc` = `v=DMARC1; p=none;`
4. Resend Domains에서 Verify — 몇 분 내 Verified 되면 끝.

### 4. Supabase 인증 메일 — 층2 SMTP (5분)
가입 인증/비번 재설정 메일 발신을 Supabase 내장(시간당 몇 통 제한, "powered by
Supabase" 푸터)에서 Resend로 교체. **실사용자 받기 전 필수.**

Supabase Dashboard → Project Settings → Authentication → SMTP Settings:
| 필드 | 값 |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | (RESEND_API_KEY 값) |
| Sender email | `no-reply@nookframe.com` |
| Sender name | `Nookframe` |

저장 후 같은 화면의 rate limit을 상향(기본 30/h 정도로 충분).

### 5. Supabase 인증 메일 — 층1 템플릿 (5분)
Dashboard → Authentication → Email Templates:
- **Confirm signup** → 본문에 `docs/auth-emails/confirm-signup.html` 붙여넣기, 제목 `메일 주소만 확인하면 가입이 끝나요`
- **Reset password** → `docs/auth-emails/reset-password.html`, 제목 `비밀번호를 다시 설정할게요`

`{{ .ConfirmationURL }}` 변수가 본문에 살아있는지만 확인. (앱은 이 두 플로우만 쓴다
— signUp + resetPasswordForEmail.)

## env 레퍼런스

| 키 | 필수 | 기본값 | 용도 |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | 게이트 | — | 없으면 모든 발신 무동작 |
| `EMAIL_FROM` | 선택 | `Nookframe <notify@nookframe.com>` | 발신자 (도메인 인증 필요) |
| `EMAIL_REPLY_TO` | 선택 | — | 회신 주소 (예: vivestarter@gmail.com) |
| `ALERT_EMAILS` | 선택 | `ADMIN_EMAILS` → vivestarter@gmail.com | 관리자 경보 수신자 (콤마 구분) |

## 검증 체크리스트
- [ ] 시연 1건 완주 → 완성 메일 수신 (포스터·watch 링크 확인)
- [ ] 잘못된 URL로 시연 → 실패 메일 카피가 대시보드 배지와 일치
- [ ] `GET /api/cron/health?key=<CRON_SECRET>` 응답에 `emailed` 필드 — 경보 있을 때 true, 5분 내 재호출 시 false(디듑)
- [ ] 가입 테스트 → 발신자가 `Nookframe <no-reply@nookframe.com>`, Supabase 푸터 없음

## 미배선(의도적 잔여)
- 클라우드 Trigger.dev 태스크(휴면 폴백)는 이메일 미발신 — 분석 이벤트와 같은 갭, 클라우드 전환 시 `docs/trigger-dev.md` 선독 후 배선.
- 재촬영/held **거절** 시 유저 통보 없음 (후속 후보 — 거절 사유 입력 UI와 함께).
- 워치독 경보 디듑은 `system_status.alerts_state` 컬럼 필요 — `supabase/migration_stuck_watchdog.sql` 적용 전엔 경보 메일을 보내지 않는다(Sentry만).
