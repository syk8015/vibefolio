# Nookframe

바이브코더의 작품을 **살아 있는 명함**으로 보여주는 서비스. 작품 URL이나 zip을 올리면 `nookframe.com/@handle` 페이지에 실제로 돌아가는 임베드와 자동 촬영된 시연 영상이 붙는다. 외부 AI(Claude·Cursor 등)가 대신 올리는 경로(Nookframe Connect)도 있다.

라이브: https://nookframe.com

## 스택

Next.js 16(App Router) · React 19 · TypeScript(strict) · Tailwind v4 · Supabase(Auth·DB·Storage, RLS) · Cloudflare R2(영상) · Vercel · E2B(작품 빌드 샌드박스) · Anthropic API(시연 탐색·검수) · Resend(메일) · Sentry.

## 폴더 지도

| 경로 | 무엇 |
|---|---|
| `app/` | 라우트. `app/[username]`=명함 페이지, `app/dashboard`=작업실, `app/admin`=관제탑, `app/api/*`=API |
| `components/` | UI. `theater/`=명함 렌더, `dashboard/`=작업실 |
| `lib/` | 서버·공용 로직. 인증 게이트(`routeAuth.ts`·`workerAuth.ts`), 에러 모양(`apiError.ts`), 업로드 안전(`upload-safety.ts`), 시연 대본(`demoScript*.ts`), i18n(`i18n/`) |
| `local-runner/` | **시연 촬영 워커**(이 맥에서만 돈다). 큐 폴링→E2B 빌드→탐색→녹화→후처리→업로드. 자체 `README.md`·`tsconfig.json` |
| `cli/` | npm 패키지 `nookframe`(CLI+MCP). 레포 코드를 import하지 않는 독립 패키지 |
| `e2b/` | 작품 빌드용 E2B 템플릿(`nookframe-builder`) |
| `supabase/` | 스키마·마이그레이션 SQL(적용은 Supabase SQL Editor에서 수동) |
| `scripts/` | 운영 스크립트·prod E2E 프로브(`probe-*.mjs`). `archive/`=옛 것 |
| `docs/` | 레퍼런스 문서(아래) |

## 로컬 실행

```bash
npm install
npm run dev        # 비밀값은 macOS 키체인에서 읽는다(scripts/_secrets.mjs). .env.local엔 공개값만
```

시연 촬영 워커(요청이 쌓였을 때 배치로):

```bash
npm run demo:batch   # 사전 준비·함정은 local-runner/README.md
```

## 검증

테스트 러너는 없다. 대신 세 겹:

```bash
npm run typecheck   # 앱 + local-runner 둘 다
npm run lint
npm test            # 네트워크 없이 도는 순수 함수 프로브
node scripts/probe-api-ingest.mjs   # 등 prod E2E 프로브 — 각 파일 머리말에 무엇을 단언하는지 적혀 있다
```

## 문서

- `docs/nookframe-connect.md` — AI 인제스트 API·PAT·초안·재촬영·발행 게이트
- `docs/i18n-review.md` — 한↔영 카피 대조표(사전 키를 바꾸면 같이 갱신)
- `docs/resend-setup.md` · `docs/turnstile-setup.md` — 메일·봇 차단 켜는 절차
- `docs/auth-emails/` — Supabase 인증 메일 템플릿(대시보드에 붙여넣기)
- `local-runner/README.md` — 워커 운영 · `cli/README.md` — CLI/MCP 사용법
- `AGENTS.md` — AI 에이전트용 규칙(보안 불변식 포함)
