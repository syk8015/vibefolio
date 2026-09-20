#!/bin/bash
# dispatchd 설치 — launchd 상주 데몬 등록.
# 라벨이 com.claudehelp.dispatch → com.nookframe.dispatch 로 바뀌었다(nookframe 편입).
# 옛 라벨을 먼저 bootout 한다 — 안 그러면 데몬 두 개가 같은 큐를 문다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node)"
LABEL="com.nookframe.dispatch"
OLD_LABEL="com.claudehelp.dispatch"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

mkdir -p "$HOME/Dispatch/logs" "$HOME/Library/LaunchAgents"

# 옛 데몬 정지 + plist 치우기(지우지 않고 .bak로 남긴다 — 되돌릴 때 필요)
launchctl bootout "gui/$(id -u)/${OLD_LABEL}" 2>/dev/null || true
OLD_PLIST="$HOME/Library/LaunchAgents/${OLD_LABEL}.plist"
[ -f "$OLD_PLIST" ] && mv "$OLD_PLIST" "${OLD_PLIST}.bak" || true

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>${ROOT}/bin/dispatch.js</string>
    <string>daemon</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${HOME}/Dispatch/logs/launchd.out.log</string>
  <key>StandardErrorPath</key><string>${HOME}/Dispatch/logs/launchd.err.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✅ launchd 등록 완료: ${LABEL}"
echo "   중지: launchctl bootout gui/$(id -u)/${LABEL}"
echo ""
echo "⚡ 전원 정책(권장, sudo 1회): 전원 연결 중 잠들지 않기"
echo "   sudo pmset -c sleep 0 displaysleep 10"
