// 대본 점검표 순수 함수 검증(네트워크 없음) — lib/demoScriptReview.ts.
// 사용: `npx -y tsx scripts/probe-script-review-unit.mts`
//
// 무엇을 보나: (1) 소넷5 실측 대본(09-03)의 통계가 기대대로 나오나 (2) 셀렉터 파서가
// id·class·태그·속성·조합자·쉼표·가상클래스를 다루나 (3) JS 셸을 "못 찾음"이 아니라
// "확인 불가"로 답하나 (4) 로봇이 여는 주소 조립이 러너(job.ts resolveEntry)와 같나.
import {
  scriptStats, selectorsOf, checkSelectorsInHtml, indexHtml, looksJsRendered, composeProbeUrl,
} from "../lib/demoScriptReview";
import type { DemoScript } from "../lib/demoScript";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// ── (1) 소넷5가 실제로 보낸 대본(09-03 밤, 요약) — 6스텝·focus 5·click 1 ──
const sonnet: DemoScript = {
  steps: [
    { goal: "사용량", selector: "#usgSec", where: "맨 위 카드", action: "focus", expect: "세션 47%", hold: 2.5 },
    { goal: "맥 상태", selector: "#macSec", where: "Mac 카드", action: "focus", expect: "배터리 82%", hold: 2.5 },
    { goal: "맥 건강", selector: "#hlSec", where: "맥 건강 카드", action: "focus", expect: "정상 칩", hold: 1.5 },
    { goal: "세션 활동", selector: "#tlSec", where: "세션 활동 카드", action: "focus", expect: "기록", hold: 2 },
    { goal: "알림 내역", selector: "#histSec", where: "알림 내역 카드", action: "focus", expect: "목록", hold: 2 },
    { goal: "새로고침", selector: "#refreshBtn", where: "새로고침 버튼", action: "click", expect: "갱신됨", hold: 2.5 },
  ],
  skip: ["페어링 온보딩"],
  prep: "/app/?demo=1",
};
const s = scriptStats(sonnet);
ok("소넷 대본: 6스텝·직배선 6", s.steps === 6 && s.wired === 6, JSON.stringify(s));
ok("소넷 대본: 조작 1(=2 미만이라 힌트 발화 구간)", s.interactive === 1);
ok("소넷 대본: expect 6·hold 6·skip 있음", s.withExpect === 6 && s.withHold === 6 && s.hasSkip && s.hasPrep);
ok("selectorsOf: 6개, 순서 유지", selectorsOf(sonnet).join(",") === "#usgSec,#macSec,#hlSec,#tlSec,#histSec,#refreshBtn");

const weak: DemoScript = {
  steps: [
    { goal: "a", where: "첫 버튼", action: "click" },
    { goal: "b", selector: "#x", action: "type", text: "hi" },
    { goal: "c", selector: "#y", action: "drag" }, // toSelector 없음 → 비직배선
    { goal: "d", selector: "#z" }, // action 없음
  ],
};
const w = scriptStats(weak);
ok("약한 대본: 직배선 1(where만·drag 도착지 없음·action 없음 제외)", w.wired === 1, JSON.stringify(w));
ok("약한 대본: 조작 3·expect 0·skip 없음", w.interactive === 3 && w.withExpect === 0 && !w.hasSkip);

// ── (2) 셀렉터 판정 ──
const html = `<!doctype html><html><head><title>t</title><style>.x{}</style></head>
<body class="dark theme-a">
<main id="root">
  <section id="usgSec" class="card usage" data-kind="usage">
    <h1>Claude</h1><button id="refreshBtn" type="button" class="btn ghost">새로고침</button>
    <a href="https://example.org/x" data-role='link'>link</a>
    <input name="code" placeholder="6자리">
  </section>
  <ul class="todo-list"><li class="todo done">a</li><li class='todo'>b</li></ul>
  <p>본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문 본문</p>
</main><script src="/app.js"></script></body></html>`;

const idx = indexHtml(html);
ok("indexHtml: id·class·태그 수집", idx.ids.has("refreshBtn") && idx.classes.has("todo-list") && idx.tags.has("input"), `ids=${[...idx.ids]}`);
ok("indexHtml: 정적 본문이라 JS 셸 아님", !looksJsRendered(idx), `text=${idx.textChars}`);

const r = checkSelectorsInHtml(html, [
  "#refreshBtn",                    // id ✓
  ".todo.done",                     // class 둘 ✓
  "section#usgSec > h1",            // 조합자 ✓
  "button[type=button]",            // 속성 = ✓
  "a[href^='https://']",            // 속성 ^= ✓
  "[data-kind]",                    // 속성 존재 ✓
  "input[name=\"code\"]",           // 따옴표 ✓
  ".todo-list li:first-child",      // 가상클래스 무시, 나머지 ✓
  "#nope, .todo",                   // 쉼표 대안 중 하나 ✓
  "#nope-xyz",                      // ✗
  ".no-such-class",                 // ✗
  "button[type=submit]",            // 값 불일치 ✗
  ":nth-child(2)",                  // 판정 불가
], "https://x.test/");
ok("checked 12·found 9", r.status === "checked" && r.checked === 12 && r.found === 9, JSON.stringify(r));
ok("missing = 정확히 3개", r.missing.join("|") === "#nope-xyz|.no-such-class|button[type=submit]", r.missing.join("|"));
ok("가상클래스만 → unparsed", r.unparsed.join("|") === ":nth-child(2)");
ok("url 그대로 실림", r.url === "https://x.test/");

// ── (3) JS 셸 → 확인 불가 ──
const spa = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/a.css"></head>
<body><div id="root"></div><script type="module" src="/assets/index-abc123.js"></script></body></html>`;
const rs = checkSelectorsInHtml(spa, ["#usgSec", "#refreshBtn"]);
ok("SPA 셸 → skipped/js-rendered(못 찾음이라 하지 않음)", rs.status === "skipped" && rs.reason === "js-rendered", JSON.stringify(rs));
ok("셀렉터 없음 → skipped/no-selectors", checkSelectorsInHtml(html, []).reason === "no-selectors");

// ── (4) 로봇이 여는 주소 조립 ──
ok("상대 url + params", composeProbeUrl("https://a.test/", { url: "/app/", params: { demo: "1" } }) === "https://a.test/app/?demo=1");
ok("절대 url은 그대로", composeProbeUrl("https://a.test/", { url: "https://b.test/demo" }) === "https://b.test/demo");
ok("access 없으면 base", composeProbeUrl("https://a.test/x?y=1", null) === "https://a.test/x?y=1");
ok("params만", composeProbeUrl("https://a.test/app/", { noLogin: true, params: { guest: "1" } }) === "https://a.test/app/?guest=1");

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
