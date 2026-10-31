#!/bin/bash
# 매일 백업(backup.sh)이 쓰는 비밀값을 키체인에 심는다 (2026-10-31). 터미널 앱에서 한 번:
#   bash ~/Desktop/nookframe/scripts/backup/setup.sh
#
# 비밀값 입력은 화면에 안 보이고(read -s), 키체인엔 argv가 아니라 `security -i`의 stdin으로
# 들어간다(ps에 안 뜬다 — scripts/_keychain.mjs와 같은 방식). 다시 돌려도 된다: 빈칸으로
# 엔터를 치면 그 항목은 그대로 둔다.
#
# 드라이브 암호(crypt)는 처음 한 번만 만든다. 다시 만들면 이미 올라간 드라이브 사본을 못
# 읽게 되므로, 이미 있으면 절대 새로 만들지 않는다.
set -euo pipefail

put() { printf 'add-generic-password -U -a %s -s %s -w %s\n' "$USER" "$1" "$2" | security -i >/dev/null; }
has() { security find-generic-password -a "$USER" -s "$1" >/dev/null 2>&1; }
plain() { # 한 줄 명령이라 공백·따옴표·역슬래시가 들면 깨진다
  if [[ "$1" =~ [[:space:]\"\'\\] ]]; then echo "  ✗ 공백·따옴표·역슬래시가 든 값은 못 넣어요"; return 1; fi
}
ask() { # 서비스 이름, 질문, hidden(1/0) → 입력하면 저장, 빈칸이면 건너뜀
  local svc=$1 q=$2 hidden=$3 v
  local mark="없음"; has "$svc" && mark="있음 — 엔터로 건너뛰기"
  if [ "$hidden" = 1 ]; then read -rsp "$q [$mark]: " v; echo; else read -rp "$q [$mark]: " v; fi
  [ -z "$v" ] && return 0
  plain "$v" && put "$svc" "$v" && echo "  ✓ 저장"
}

echo "1) Supabase › Connect › Session pooler 주소를 그대로 붙여 넣어요([YOUR-PASSWORD]가 든 채로 — 비밀값 아님)"
read -rp "   주소: " uri
if [ -n "$uri" ]; then
  if [[ "$uri" =~ ^(postgres(ql)?://[^:@/]+)(:[^@]*)?@(.+)$ ]]; then
    clean="${BASH_REMATCH[1]}@${BASH_REMATCH[4]}"
    [[ "$clean" == *pooler.supabase.com* ]] || echo "  ! pooler 주소가 아니에요 — 직접 주소는 IPv6 전용이라 안 될 수 있어요"
    plain "$clean" && put nookframe-backup-db-url "$clean" && echo "  ✓ 저장 (비밀번호 뺀 주소)"
  else
    echo "  ✗ postgresql://… 모양이 아니에요"; exit 1
  fi
fi
ask nookframe-backup-db-password "2) 데이터 저장소 비밀번호 (안 보여요)" 1

echo "3) Cloudflare › R2 › API 토큰(이 버킷 Object Read 전용)을 만들면 나오는 값들"
read -rp "   S3 주소(https://…r2.cloudflarestorage.com): " ep
if [ -n "$ep" ]; then
  ep=$(printf '%s' "$ep" | sed -E 's#^(https://[^/]+).*#\1#')
  plain "$ep" && put nookframe-backup-r2-endpoint "$ep" && echo "  ✓ 저장"
fi
ask nookframe-backup-r2-key-id "   Access Key ID (안 보여요)" 1
ask nookframe-backup-r2-secret "   Secret Access Key (안 보여요)" 1

if has nookframe-backup-crypt; then
  echo "4) 드라이브 암호: 이미 있어요 (새로 안 만들어요)"
else
  pw=$(openssl rand -hex 32)
  put nookframe-backup-crypt "$pw"
  printf '%s' "$pw" | pbcopy
  echo "4) 드라이브 암호를 새로 만들어 클립보드에 복사했어요 (${pw:0:4}…)."
  echo "   지금 '암호' 앱에 'Nookframe 백업 암호'로 붙여 넣어 두세요."
  echo "   이 맥이 없어지면 이 암호 없이는 드라이브 백업을 못 열어요."
  unset pw
fi

echo
for s in db-url db-password r2-endpoint r2-key-id r2-secret crypt; do
  if has "nookframe-backup-$s"; then echo "  ✓ $s"; else echo "  ✗ $s (아직 없음)"; fi
done
