# scripts/archive — 보관용(실행 안 함)

옛 작업의 흔적. 빌드·타입검사에서 제외된다(`tsconfig.json` exclude). 지우지 않고 둔 이유는 "그때 무엇을 재봤는지"를 다시 볼 일이 가끔 있어서.

| 파일 | 무엇이었나 | 지금 상태 |
|---|---|---|
| `inspect-pw.mjs` · `inspect-template.mjs` · `recon-frame.mjs` | 2026-05~06 E2B 샌드박스 안 Playwright/Xvfb 캡처 레시피 탐색 | 레시피는 `local-runner/`에 정착. 실행 가능하나 쓸 일 없음 |
| `vt-probe.mts` · `vt-probe2.mts` · `dry-run-capture.mts` · `test-zoom-filter.mts` · `trigger-build.mjs` | 클라우드(Trigger.dev+E2B) 녹화 경로 검증 | **실행 불가** — 클라우드 녹화 경로(`src/trigger/`)와 `@trigger.dev` 의존성은 2026-09-04에 삭제됨. 로컬 대응물은 `scripts/test-zoom-filter-local.mts` |
| `probe-demo-access.mjs` | `migration_demo_access.sql` 적용 직후 컬럼 왕복 검증 | 마이그레이션 적용 완료. 현행 검증은 `scripts/probe-demo-access-gate.mjs` |
| `demo-quota-test.sql` | 쿼터 함수 수동 테스트 SQL(마이그레이션 아님) | 현행 검증은 `scripts/probe-quota.mjs` |
