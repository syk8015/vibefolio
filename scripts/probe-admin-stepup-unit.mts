// 관리자 추가 인증 판정(lib/adminStepUp.ts) — 순수 함수. `npm test`.
import { needsStepUp, normalizeCountries, adminNext, DEFAULT_HOME_COUNTRIES } from "../lib/adminStepUp";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const homes = ["KR"];

ok("집 나라 + aal1 → 그냥 열림", !needsStepUp({ country: "KR", aal: "aal1", homes }));
ok("집 나라 소문자·빈칸도 같다", !needsStepUp({ country: " kr ", aal: "aal1", homes }));
ok("다른 나라 + aal1 → 6자리", needsStepUp({ country: "JP", aal: "aal1", homes }));
ok("다른 나라 + aal 없음 → 6자리", needsStepUp({ country: "US", aal: null, homes }));
ok("다른 나라 + aal2 → 열림", !needsStepUp({ country: "JP", aal: "aal2", homes }));
ok("나라 모름(?) → 6자리", needsStepUp({ country: "?", aal: "aal1", homes }));
ok("나라 머리표 없음 → 6자리", needsStepUp({ country: null, aal: "aal1", homes }));
ok("나라 모름 + aal2 → 열림", !needsStepUp({ country: "?", aal: "aal2", homes }));
ok("집 나라 목록이 비면 어디서든 6자리", needsStepUp({ country: "KR", aal: "aal1", homes: [] }));
ok("aal 'AAL2' 같은 다른 모양은 안 믿음", needsStepUp({ country: "JP", aal: "AAL2", homes }));

ok("나라 목록 다듬기", JSON.stringify(normalizeCountries(["kr", " JP ", "KOR", 3, "", "kr"])) === '["KR","JP"]');
ok("배열 아니면 빈 목록", normalizeCountries("KR").length === 0 && normalizeCountries(null).length === 0);
ok("기본 집 나라 = KR", JSON.stringify(DEFAULT_HOME_COUNTRIES) === '["KR"]');

ok("돌아갈 곳: /admin/promo 그대로", adminNext("/admin/promo") === "/admin/promo");
ok("돌아갈 곳: 없음 → /admin", adminNext(undefined) === "/admin");
ok("돌아갈 곳: 밖 주소 → /admin", adminNext("https://evil.example/admin") === "/admin");
ok("돌아갈 곳: // 모양 → /admin", adminNext("//evil.example") === "/admin");
ok("돌아갈 곳: /adminx → /admin", adminNext("/adminx") === "/admin");
ok("돌아갈 곳: 확인 화면 자신 → /admin", adminNext("/admin/verify") === "/admin");
ok("돌아갈 곳: 위로 가기(..) → /admin", adminNext("/admin/../dashboard") === "/admin");
ok("돌아갈 곳: 물음표 붙음 → /admin", adminNext("/admin?x=1") === "/admin");

console.log(failed ? `\n${failed}건 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
