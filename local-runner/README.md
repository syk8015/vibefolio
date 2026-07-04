# local-runner — M5 로컬 녹화 워커

E2B가 빌드/서빙(공개 URL만 넘어옴), 이 맥북이 탐색·녹화·후처리·업로드를 담당한다.
큐 = `projects` 테이블 (`demo_build_status='pending'` 행). 상세 설계는
`~/Documents/nookframe_local_runner_plan.md`.

## 운영 모델 (2026-07-05 결정)

- Vercel prod에 `DEMO_RUNNER=local` 이 설정되어 있으면 사이트의 "시연 만들기"는
  Trigger.dev 클라우드 태스크를 쏘지 않고 pending 행만 남긴다 → **큐에서 대기**.
- 워커는 상시 기동하지 않는다. 노트북을 켰을 때 수동으로 시작해 큐를 비운다:

  ```bash
  npm run demo:worker
  ```

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

## CLI (큐 없이 단발 실행/드라이런)

```bash
npx -y tsx local-runner/index.ts <url|github-url> [--project <id>] [--policy read-only|full] [--upload]
```

`--project` 없이 돌리면 `manual-*` 드라이런: DB를 건드리지 않고 `_test/`에 업로드.
