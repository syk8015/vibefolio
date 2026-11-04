# 매일 밈 — 밤 작업 (주인의 맥)

홈 타이핑 문구 후보를 밤마다 만들어 **'대기'로만** 서버에 넣는다. 공개는 주인이 `/admin/memes`에서 하나씩 승인할 때만.
설계: `~/Desktop/nookframe-작업물/nookframe-research-2026-11-04/daily-memes/01-설계.md`

| 파일 | 하는 일 |
|---|---|
| `run.mjs` | 순서대로 돌림: 사용량 판단 → 재료 모으기 → (쓰기·검사: 다음 단계) → 기록 |
| `usage.mjs` | 구독 한도(5시간 칸·주간)와 끝나는 시각, 작업 실측 비용으로 오늘 밤 돌릴지 판단 |
| `gather.mjs` | 정해진 출처만 한 번씩(정직한 UA, 403·429 재시도 없음) → `raw/<날짜>/` |
| `trend.mjs` | 문구 유행 숫자: 지난 7일 vs 그 전 30일(HN·Bluesky·위키) → 점수·판정 |
| `filter.mjs` | 1차 거르기: 형식·기존 문구 겹침·비하 낱말(빼기), 숫자·날짜·논란 낱말(표시) |
| `export-existing.mts` | 지금 코드의 홈 문구 4묶음 → `existing-lines.json`(install.sh가 부름) |

- 설치·갱신: `bash scripts/memes/install.sh` (사본: `~/Library/Application Support/Nookframe/memes/`, 기록: `~/Library/Logs/nookframe-memes.log`)
- 손으로 한 번: `cd ~/Library/Application\ Support/Nookframe/memes && node run.mjs --force` (서버 기록 없이)
- 끄기: `launchctl bootout gui/$(id -u)/com.nookframe.memes`
- 열쇠: 키체인 `nookframe-meme-secret`(후보를 '대기'로 넣기만 가능). Claude 사용량은 Claude Code 로그인(키체인)으로 앤트로픽에만 묻는다.
- `ANTHROPIC_API_KEY`는 `run-nightly.sh`가 지운다 — 있으면 `claude -p`가 구독 대신 API로 청구된다.
