# Cloudflare Turnstile 셋업 (T6 — 가입 봇 차단)

코드는 전부 배선돼 있고(`components/TurnstileWidget.tsx` + signup/login/forgot-password 3폼),
**켜는 스위치는 2개가 한 쌍**이다. 하나만 켜면 인증이 깨진다:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 없음 + Supabase 캡차 OFF → 지금 상태(위젯 없음, 정상 동작)
- 사이트 키 있음 + Supabase 캡차 OFF → 위젯은 뜨지만 토큰은 무시됨(무해)
- 사이트 키 없음 + Supabase 캡차 ON → **가입/로그인/비번재설정 전부 실패** (토큰 없이 요청)

## 절차 (순서 중요 — 사이트 키 먼저, Supabase 마지막)

### 1. Cloudflare에서 위젯 생성
1. https://dash.cloudflare.com → 좌측 **Turnstile** → **Add widget**
2. Widget name: `nookframe-auth`
3. Hostnames: `nookframe.com` (+ 로컬 테스트용 `localhost`)
4. Widget Mode: **Managed** (권장 — 의심스러운 경우만 체크박스 노출)
5. 생성하면 **Site Key**(공개)와 **Secret Key**(비밀) 두 개가 나온다.

### 2. 앱에 사이트 키 배포
```bash
# .env.local 에 추가
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key>

# Vercel prod (secret key 아님! site key만 — NEXT_PUBLIC이라 브라우저 노출이 정상)
npx -y vercel@latest env add NEXT_PUBLIC_TURNSTILE_SITE_KEY production
# 이후 redeploy 필요 (NEXT_PUBLIC은 빌드타임 인라인)
```
이 시점까지는 위젯만 뜨고 강제되지 않는다 — 배포가 전파될 시간을 벌어준다.

### 3. Supabase에서 강제 켜기 (마지막에)
1. https://supabase.com/dashboard/project/nepwsgrtonmexgqplcdp → **Authentication → Attack Protection**
2. **Enable CAPTCHA protection** ON
3. Provider: **Turnstile**, Secret key: `<secret key>` 붙여넣기
4. Save

이 순간부터 `signUp` / `signInWithPassword` / `resetPasswordForEmail`이 전부
`captchaToken`을 요구한다. 폼 3종이 이미 토큰을 보내고 있으므로 그대로 동작.
Google OAuth(`signInWithOAuth`)는 Supabase가 캡차를 걸지 않는다.

## 검증
1. 시크릿 창에서 `/signup` → 폼 아래 Turnstile 위젯 표시 확인
2. 위젯 통과 전 제출 버튼 disabled 확인
3. 실가입 1회(throwaway 이메일) → check-email 단계 도달 확인
4. `/login`·`/forgot-password`도 위젯 표시 확인

## 끄기 (롤백)
역순: Supabase 캡차 OFF 먼저 → 그 다음 env 제거. env만 먼저 지우면 인증 전면 파손.

## 함정
- **Turnstile 토큰은 1회용** — 제출 실패 시 `resetTurnstile()`로 위젯 리셋(폼 3종에 이미 배선).
- 위젯 테마는 `data-theme` 스탬프를 읽어 라이트/다크 맞춤(OS 아닌 사이트 토글 기준).
- CSP `script-src`는 이 저장소에서 의도적 보류 상태라 `challenges.cloudflare.com` 로드에 제약 없음.
  CSP를 켜게 되면 `script-src`/`frame-src`에 `https://challenges.cloudflare.com` 추가 필요.
