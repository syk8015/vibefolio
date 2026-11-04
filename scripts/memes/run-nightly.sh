#!/bin/bash
# launchd가 매일 02:30에 부르는 겉껍질(2026-11-05). 사본 위치: ~/Library/Application Support/Nookframe/memes/
# - launchd 환경은 PATH가 비어 있다 → Homebrew node 경로를 직접 넣는다.
# - ANTHROPIC_API_KEY를 지운다: 이 키가 있으면 claude -p가 구독이 아니라 API 크레딧으로 청구된다(공식 문서).
# - caffeinate: 도는 동안만 잠자기를 막는다(작업이 끝나면 풀림).
set -uo pipefail
# claude는 ~/.local/bin에 깔린다(공식 설치) — launchd PATH엔 없어서 넣는다(11-05 실측 ENOENT).
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1
echo "== $(date '+%F %T') 매일 밈 밤 작업 시작"
caffeinate -i node run.mjs --submit
echo "== $(date '+%F %T') 끝 (종료 코드 $?)"
