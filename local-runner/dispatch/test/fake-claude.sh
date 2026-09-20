#!/bin/bash
# 테스트용 가짜 claude — 워크스페이스(cwd)에 산출물을 쓰고 -p 결과 json을 출력한다.
#   FAKE_MODE=ok    (기본) REPORT.md 하나
#   FAKE_MODE=multi        REPORT.md + BACKLOG.md — 2026-09-20에 실제로 물린 모양
#   FAKE_MODE=fail         보고서 없이 실패 종료
if [ "${FAKE_MODE:-ok}" = "fail" ]; then
  echo "simulated failure" >&2
  exit 1
fi
cat > REPORT.md <<'EOF'
# 테스트 보고서
정상 — 가짜 claude가 생성한 요약 문장입니다.

본문 내용.
EOF
if [ "${FAKE_MODE:-ok}" = "multi" ]; then
  cat > BACKLOG.md <<'EOF'
# 실행 목록
- 높음: /explore 공개 탐색 페이지
EOF
fi
echo '{"type":"result","subtype":"success","is_error":false,"num_turns":3,"session_id":"fake-sess","result":"done"}'
