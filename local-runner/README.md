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

## 배치 운영 (2026-08-11부터 기본)

상시 워커는 설치하지 않는다(오너 맥의 메모리·화면 점유 회피). 평상시
`demo_paused=true`가 정상 상태이고, 요청이 들어오면 health 크론이 "촬영 요청
대기" 메일(6h 디덥)로 알려준다. 여유될 때 한 줄:

```bash
npm run demo:batch   # unpause → 큐 소화(빈 큐면 즉시) → repause → 종료
```

Ctrl-C·크레딧 킬스위치 등 모든 종료 경로에서 repause가 보장된다. 상시화로
되돌리려면 `bash local-runner/launchd/install.sh` + `demo_paused=false`.

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

## 모더레이션 (게시 전 콘텐츠 스캔, 2026-07-19)

실프로젝트 업로드 직전 body.mp4에서 프레임 4장(480p)을 뽑아 비전 분류에 통과시킨다
(`moderate.ts`, 기본 `claude-opus-4-8` — `DEMO_MODERATION_MODEL`로 교체 가능, 편당
~$0.015). dry-run(`manual-*`)과 `--upload` 없는 실행은 스캔하지 않는다(비용 0).

- **ok** → 기존과 동일하게 게시. 스캔이 API 장애로 못 돌면 **fail-open**(그대로
  게시 + Sentry warning `moderation_failed_open`) — 스캔 장애가 코어 루프를 막지
  않는다. 뒷배는 신고 경로(T6).
- **flag** → 영상·포스터를 버전드 키로 업로드하되 `demo_video_url`은 **비워둔 채**
  (공개 표면은 그 컬럼만 읽는다) `demo_moderation` 행 + `held`(마커
  `[moderation]…`) + 관리자 메일. `/admin` 모더레이션 인박스에서 승인(게시) /
  거절(격리 파일 삭제 + failed `[policy]`). 30분 넘게 방치되면 워치독이 재경보.
- `[moderation]` 홀드는 크레딧 해제 스윕(`like '[credit]%'`)에 **안 걸린다** —
  마커가 다르므로 위 SQL을 그대로 써도 안전.

무과금 경로 테스트: `NF_FAKE_MODERATION=flag|ok` (운영 env 설정 금지). 배관 검증:
`npx -y tsx local-runner/probe-moderation.ts` (`--live` = 실 분류기 1회, ~$0.01).

- 큐가 비면 10초 간격으로 폴링하며 대기한다. `Ctrl-C` 1번 = 현재 작업 마치고 종료,
  2번 = 즉시 중단(다음 시작 시 startup recovery가 해당 행을 failed로 정리).

## 주의

- **녹화 중 이 머신의 화면을 쓰지 말 것.** Chrome 창이 맨 앞에 떠야 하고(avfoundation
  화면 캡처), 알림/다른 창이 덮으면 영상에 박힌다. 방해금지는 파이프라인이 강제한다
  (아래 § Focus setup — 단축어 없으면 촬영 거부).
- `DEMO_RUNNER=local`이 아닌 배포에서 워커를 돌리면 클라우드 태스크와 **이중 소비**
  (이중 과금) — 반드시 배포 환경변수 상태와 짝 맞춰 운용.
- 클라우드 경로로 되돌리기: Vercel에서 `DEMO_RUNNER` 삭제(또는 값 변경) 후 재배포.
  `src/trigger/*`는 그대로 배포되어 있으므로 즉시 복귀된다.
- 비용: explore(computer-use) ~$0.13/편이 Anthropic API로 과금. 크레딧 잔고 확인.

## Focus setup (방해금지 강제 — 1회 설정)

촬영 중 도착한 개인 알림 배너(메시지·메일 미리보기)가 공개 영상에 박히는 걸 막기 위해
파이프라인이 매 테이크 방해금지(DND)를 켜고 끝나면 복원한다(`focus.ts`). macOS엔
Focus를 직접 제어하는 CLI가 없어서 **단축어(Shortcuts) 2개가 이 머신에 있어야 하고,
없으면 explore 비용을 쓰기 전에 촬영을 거부한다.**

단축어 앱에서 아래 2개를 정확한 이름으로 1회 생성 (동작: "집중 모드 설정" / Set Focus):

| 이름 | 동작 설정 |
|---|---|
| `nookframe-dnd-on` | 방해금지를 **켜기** — "끌 때까지" (until Turned Off) |
| `nookframe-dnd-off` | 방해금지를 **끄기** |

검증: `shortcuts run nookframe-dnd-on` 실행 후 메뉴바에 달 아이콘이 뜨면 성공,
`shortcuts run nookframe-dnd-off`로 꺼지는 것까지 확인.

한계(알고 있을 것): DND 상태 파일은 TCC 보호라 읽을 수 없어 사전 상태 복원이 아니라
무조건 off로 복원한다. 사용자가 일부러 켜둔 DND도 테이크가 끝나면 꺼진다.

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
npx -y tsx local-runner/probe-drag.ts     # drag 액션 (슬라이더 값·링·카메라)
npx -y tsx local-runner/probe-sketch.ts   # path 액션 (프리핸드 스트로크·잉크 픽셀)
npx -y tsx local-runner/probe-netguard.ts # 사설IP/LAN 차단 (fetch·iframe·goto·DNS·WS 벡터별 단언)
```
