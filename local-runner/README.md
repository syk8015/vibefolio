# local-runner — M5 로컬 녹화 워커

E2B가 빌드/서빙(공개 URL만 넘어옴), 이 맥북이 탐색·녹화·후처리·업로드를 담당한다.
큐 = `projects` 테이블 (`demo_build_status='pending'` 행). 상세 설계는
`~/Documents/nookframe_local_runner_plan.md`.

## 운영 모델 (2026-07-05 결정 · 2026-07-13 갱신)

- Vercel prod에 `DEMO_RUNNER=local` 이 설정되어 있으면 사이트의 "시연 만들기"는
  Trigger.dev 클라우드 태스크를 쏘지 않고 pending 행만 남긴다 → **큐에서 대기**.
- **2026-07-13 확정: 녹화는 이 맥북 로컬 경로 온리.** 클라우드(E2B/Trigger) 녹화
  폴백은 영구 미사용 — `src/trigger/*`는 휴면 방치(삭제·재배포 안 함). E2B는
  github/zip **빌드·서빙** 역할로만 계속 쓴다.
- 워커는 launchd 감시자가 상시 유지한다(`launchd/README.md`). 수동 기동은:

  ```bash
  npm run demo:worker
  ```

## 크레딧 소진 시 (P0.5)

explore 호출이 크레딧 소진(402/billing)으로 실패하면 워커가 자동으로:
해당 잡을 `held`(마커 `[credit]…`, 실패 아님·attempt 미소모)로 돌리고,
`system_status.demo_paused=true`로 드레인을 멈추고, Sentry에 fatal 경보를 쏜다.

**충전 후 해제 (Supabase SQL Editor):**

```sql
update system_status set demo_paused = false where id = 'singleton';
update projects set demo_build_status = 'pending', demo_build_error = null
  where demo_build_status = 'held' and demo_build_error like '[credit]%';
```

무과금 경로 테스트: `NF_FAKE_CREDIT_402=1`을 워커 env에 넣고 pending 잡 하나를
흘리면 실제 API 호출 없이 위 전 경로가 발화한다(운영 env에는 절대 설정 금지).

- 큐가 비면 10초 간격으로 폴링하며 대기한다. `Ctrl-C` 1번 = 현재 작업 마치고 종료,
  2번 = 즉시 중단(다음 시작 시 startup recovery가 해당 행을 failed로 정리).

## 주의

- **녹화 중 이 머신의 화면을 쓰지 말 것.** Chrome 창이 맨 앞에 떠야 하고(avfoundation
  화면 캡처), 알림/다른 창이 덮으면 영상에 박힌다. 방해금지 모드 권장.
- `DEMO_RUNNER=local`이 아닌 배포에서 워커를 돌리면 클라우드 태스크와 **이중 소비**
  (이중 과금) — 반드시 배포 환경변수 상태와 짝 맞춰 운용.
- 클라우드 경로로 되돌리기: Vercel에서 `DEMO_RUNNER` 삭제(또는 값 변경) 후 재배포.
  `src/trigger/*`는 그대로 배포되어 있으므로 즉시 복귀된다.
- 비용: explore(computer-use) ~$0.13/편이 Anthropic API로 과금. 크레딧 잔고 확인.

## 필요 환경 (.env.local, 레포 루트)

`ANTHROPIC_API_KEY`, `E2B_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` — config.ts가 `process.loadEnvFile`로 로드.

선택: `RESEND_API_KEY`가 있으면 완성/실패 메일(소유자)과 크레딧 소진 경보(관리자)를
보낸다. 없으면 전부 무동작 — 절차는 `docs/resend-setup.md`.

## CLI (큐 없이 단발 실행/드라이런)

```bash
npx -y tsx local-runner/index.ts <url|github-url> [--project <id>] [--policy read-only|full] [--upload] [--hint "핵심 기능 설명"]
```

`--project` 없이 돌리면 `manual-*` 드라이런: DB를 건드리지 않고 `_test/`에 업로드.
`--hint`는 제작자 "핵심 기능" 설명(= `projects.demo_user_hint`)을 explore 브리핑에
주입한다 — 큐 경로에선 워커가 행에서 자동으로 읽으므로 CLI 검증용.

## 무API 프로브

```bash
npx -y tsx local-runner/probe-drag.ts    # drag 액션 (슬라이더 값·링·카메라)
npx -y tsx local-runner/probe-sketch.ts  # path 액션 (프리핸드 스트로크·잉크 픽셀)
```
