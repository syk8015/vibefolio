# dispatch — nookframe 자동 실행기

UI 없는 백엔드 자동화. 잡을 큐에 넣으면 맥이 `claude -p`로 돌리고, 산출물을 `~/Dispatch/outbox/`에
내려놓고 폰으로 알린다. **대상은 nookframe 하나다.**

원본은 `~/Desktop/cluadehelp/claude-dispatch/`(그대로 남아 있다). 2026-09-20 결정으로
**프로젝트를 통째로 옮긴 게 아니라 기능만 여기로 편입**했다.

## 쓰는 법

```bash
./bin/dispatch.js init                      # ~/Dispatch 생성
./bin/dispatch.js add research "경쟁사 가격 정책 조사"
./bin/dispatch.js add site-monitor "" --daily 09:00
./bin/dispatch.js list
./bin/dispatch.js run                       # 지금 due인 것 1회 처리(포그라운드)
./bin/dispatch.js status                    # 한도 게이트 스냅샷
./bin/dispatch.js doctor                    # 환경 점검
./install.sh                                # launchd 상주 등록 (com.nookframe.dispatch)
npm test                                    # 53개 — 네트워크·실제 claude 없이 돈다
```

## 편입 때 무엇이 바뀌었나

| | 전 (cluadehelp) | 후 (여기) |
|---|---|---|
| 대상 | 레지스트리 카드 여러 장 (`~/Dispatch/registry/*.md`) | `src/project.js` 한 곳에 고정 |
| 권한 | 티어 T1/T2로 갈림 | `workerSettings()` 한 벌 |
| 시크릿 | `~/.dispatch/token-cache.json` (0700 평문) | 맥 키체인 (`scripts/_keychain.mjs`) |
| 실행 시점 | 04~06시 자동 시간표 | 큐가 정한다 (시간표는 기본 꺼둠 · `QUEUE-DESIGN.md`) |
| 산출물 | `REPORT.md` **한 장만** 수거 🐛 | 워크스페이스의 **모든 파일** 수거 |
| launchd | `com.claudehelp.dispatch` | `com.nookframe.dispatch` |

**안 바뀐 것**: 한도 게이트(주간·5h·모델별·하루 예산) · 폰 웹푸시 · `~/Dispatch/` 데이터 경로 ·
**Bash 전 워커 금지**.

## Bash를 왜 계속 막나

편입해도 경계는 그대로다: **에이전트는 무엇을 만들지 정하고, 실행은 신뢰 코드가 한다.**
빌드·촬영·인코딩·업로드·git은 `local-runner`의 다른 모듈이 맡는다. 에이전트에 셸을 주는 게 아니라,
셸을 쓰는 코드 옆에 에이전트를 둔 것이다.

## 산출물 규약

워커는 워크스페이스(`~/Dispatch/runs/<잡id>/`)에 파일을 남긴다.

- `REPORT.md` — **필수.** 첫 줄 `# 제목`, 둘째 줄 한 문장 요약(푸시에 그대로 실린다)
- 그 밖의 파일 — 있으면 전부 같이 나간다. `.claude/`와 `JOB.md`만 제외

outbox 이름: `<타입>-<주제슬러그>-<잡id뒤4>.md`가 보고서, 나머지는 `...--<경로>.<확장자>`.
같은 날짜 폴더 안에서 나란히 붙는다.

## 운영 메모 (nookframe 세션이 2026-09-20에 낸 결론)

1. `code-review`는 **반복(`--daily`)으로 걸지 말 것** — 이미 보류로 결정된 건을 매번 다시 올린다
2. `research`도 반복 금지. 주제 있을 때 1회성으로
3. `site-monitor`는 주 1회. 점검 항목은 프롬프트에 박혀 있다(200만 보면 못 잡는 표면 3개)
4. 워커는 제안 전에 `decisions_ledger.md`·`backlog.md`를 대조한다 — 프롬프트에 박아뒀다

## 되돌리기

```bash
launchctl bootout gui/$(id -u)/com.nookframe.dispatch
mv ~/Library/LaunchAgents/com.claudehelp.dispatch.plist.bak \
   ~/Library/LaunchAgents/com.claudehelp.dispatch.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.claudehelp.dispatch.plist
```

`~/Dispatch/`는 어느 쪽이든 건드리지 않으므로 큐·보고서는 보존된다.
