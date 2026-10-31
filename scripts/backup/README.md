# 매일 백업 (2026-10-31)

무엇을·어디로·얼마나는 `backup.sh` 머리 주석에 있다. 요약: 데이터 저장소(public·auth·storage) + R2 버킷 전체 → 이 맥 `~/Backups/nookframe` + 개인 구글 드라이브 `nookframe-backup/`(rclone crypt 암호화), 30일.

## 처음 한 번 (사용자)

1. **데이터 저장소 비밀번호** — 모르면 Supabase › Project Settings › Database › Reset database password. 앱·워커·스크립트는 이 비밀번호를 안 쓴다(API 키를 쓴다) — 바꿔도 사이트는 그대로다.
2. **R2 읽기 전용 열쇠** — Cloudflare › R2 › Manage API tokens › Create: 권한 *Object Read only*, 버킷 `nookframe`만. 만든 화면의 S3 주소·Access Key ID·Secret을 3번에서 넣는다.
3. 터미널 앱에서 `bash ~/Desktop/nookframe/scripts/backup/setup.sh` — 값은 화면에 안 보이고 키체인으로만 간다. 마지막에 클립보드로 받은 **드라이브 암호를 '암호' 앱에 저장**.
4. `rclone config create gdrive drive scope drive.file` — 브라우저에서 개인 구글 계정으로 허락. (`drive.file`이라 rclone이 만든 파일만 만질 수 있다.)
5. 첫 백업 `bash scripts/backup/backup.sh`, 확인 뒤 `bash scripts/backup/install.sh`(launchd에 걸기).

## 되살리기

- 맥 사본: `~/Backups/nookframe/db/nookframe-YYYY-MM-DD.dump`, 파일 거울 `files/`, 지워지거나 바뀐 파일 `files-archive/YYYY-MM-DD/`.
- 맥이 없을 때: 새 맥에서 4번(gdrive) + `rclone config create nfdrive crypt remote gdrive:nookframe-backup password <암호 앱의 값>` → `rclone copy nfdrive:db ./db`, `rclone copy nfdrive:files ./files`.
- 데이터 저장소: 새 Supabase 프로젝트에 `pg_restore --no-owner --schema=public` 으로 구조·데이터, auth는 `--data-only --schema=auth`(새 프로젝트에 auth 표가 이미 있다). 칸 단위 GRANT(`migration_private_columns.sql`)가 제대로 들어왔는지 꼭 확인 — 보안이 거기 걸려 있다.
- 파일: `rclone sync ./files <새 R2>:nookframe`.
- 한 달에 한 번 빈 새 프로젝트에 실제로 되살려 본다(보안 로드맵 1단계). 절차가 바뀌면 여기를 고친다.
