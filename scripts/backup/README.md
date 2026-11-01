# 매일 백업 (2026-10-31)

무엇을·어디로·얼마나는 `backup.sh` 머리 주석에 있다. 요약: 데이터 저장소(public·auth·storage) + R2 버킷 전체 → 이 맥 `~/Backups/nookframe` + 개인 구글 드라이브 `nookframe-backup/`(rclone crypt 암호화), 30일.

## 처음 한 번 (사용자)

1. **데이터 저장소 비밀번호** — 모르면 Supabase › Project Settings › Database › Reset database password. 앱·워커·스크립트는 이 비밀번호를 안 쓴다(API 키를 쓴다) — 바꿔도 사이트는 그대로다.
2. **R2 읽기 전용 열쇠** — Cloudflare › R2 › Manage API tokens › Create: 권한 *Object Read only*, 버킷 `nookframe`만. 만든 화면의 S3 주소·Access Key ID·Secret을 3번에서 넣는다.
3. 터미널 앱에서 `bash ~/Desktop/nookframe/scripts/backup/setup.sh` — 값은 화면에 안 보이고 키체인으로만 간다. 마지막에 클립보드로 받은 **드라이브 암호를 '암호' 앱에 저장**.
4. 터미널 앱에서 `rclone config create gdrive drive scope drive.file >/dev/null` — 브라우저에서 개인 구글 계정으로 허락. (`drive.file`이라 rclone이 만든 파일만 만질 수 있다.) ⚠️ `>/dev/null`을 빼면 구글 토큰을 화면에 그대로 찍는다 — 채팅(`!`)에서 돌리지 말 것.
5. 첫 백업 `bash scripts/backup/backup.sh`, 확인 뒤 `bash scripts/backup/install.sh`(launchd에 걸기).

## 되살리기

- 맥 사본: `~/Backups/nookframe/db/nookframe-YYYY-MM-DD.dump`, 파일 거울 `files/`, 지워지거나 바뀐 파일 `files-archive/YYYY-MM-DD/`.
- 맥이 없을 때: 새 맥에서 4번(gdrive) + `rclone config create nfdrive crypt remote gdrive:nookframe-backup password <암호 앱의 값>` → `rclone copy nfdrive:db ./db`, `rclone copy nfdrive:files ./files`.
- 데이터 저장소: **`restore-drill.sh`의 1·2단계 순서를 그대로 따른다** — 그게 검증된 절차다. 요점 셋(2026-11-02 첫 연습에서 잡힌 것):
  1. 넣기 **전에** 새 프로젝트의 public 기본 권한을 비운다(`alter default privileges for role postgres in schema public revoke all on tables/sequences/functions from anon, authenticated, service_role`). 안 그러면 실서버에서 잠근 표가 anon에게 열린 채 되살아난다 — 백업의 권한은 GRANT만 적혀 있다.
  2. auth는 `--data-only`로 `users` 먼저, `identities` 다음(한 번에 넣으면 목차 순서 탓에 외래 키 오류).
  3. public은 `pg_restore -l`로 목차를 뽑아 `DEFAULT ACL … supabase_admin` 줄을 빼고 `-L`로 넣는다(postgres가 못 바꾸는 줄, 새 프로젝트에 이미 같은 값).
  넣은 뒤 `restore-drill.sh`의 맞춰 보기 쿼리로 칸 권한까지 실서버(또는 백업 당시)와 같은지 본다.
- 파일: `rclone sync ./files <새 R2>:nookframe`.
- 한 달에 한 번 빈 새 프로젝트에 실제로 되살려 본다(보안 로드맵 1단계). 절차가 바뀌면 여기를 고친다.
