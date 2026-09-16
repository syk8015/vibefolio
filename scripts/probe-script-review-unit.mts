// 대본 점검표 순수 함수 검증(네트워크 없음) — lib/demoScriptReview.ts.
// 사용: `npx -y tsx scripts/probe-script-review-unit.mts`
//
// 무엇을 보나: (1) 소넷5 실측 대본(09-03)의 통계가 기대대로 나오나 (2) 셀렉터 파서가
// id·class·태그·속성·조합자·쉼표·가상클래스를 다루나 (3) JS 셸을 "못 찾음"이 아니라
// "확인 불가"로 답하나 (4) 로봇이 여는 주소 조립이 러너(job.ts resolveEntry)와 같나
// (5) 첫 화면/뒤 화면을 갈라, 뒤 화면 셀렉터를 "없음"이라 하지 않나(09-15 스킨로그 0/8 오경보).
import {
  scriptStats, selectorsOf, checkSelectorsInHtml, indexHtml, looksJsRendered, composeProbeUrl,
  estimateFilm,
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
const sg = selectorsOf(sonnet);
ok("selectorsOf: focus 5개 뒤 첫 click까지 전부 첫 화면·순서 유지",
  sg.entry.join(",") === "#usgSec,#macSec,#hlSec,#tlSec,#histSec,#refreshBtn" && sg.later.length === 0, JSON.stringify(sg));

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

const r = checkSelectorsInHtml(html, {
  entry: [
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
  ],
  later: [],
}, "https://x.test/");
ok("checked 12·found 9", r.status === "checked" && r.checked === 12 && r.found === 9, JSON.stringify(r));
ok("missing = 정확히 3개", r.missing.join("|") === "#nope-xyz|.no-such-class|button[type=submit]", r.missing.join("|"));
ok("가상클래스만 → unparsed", r.unparsed.join("|") === ":nth-child(2)");
ok("url 그대로 실림·later 없음", r.url === "https://x.test/" && r.later.length === 0);

// ── (3) JS 셸 → 확인 불가 ──
const spa = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/a.css"></head>
<body><div id="root"></div><script type="module" src="/assets/index-abc123.js"></script></body></html>`;
const rs = checkSelectorsInHtml(spa, { entry: ["#usgSec", "#refreshBtn"], later: [] });
ok("SPA 셸 → skipped/js-rendered(못 찾음이라 하지 않음)", rs.status === "skipped" && rs.reason === "js-rendered" && rs.missing.length === 0, JSON.stringify(rs));

// 09-15 스킨로그 실측을 본뜬 Next.js 빈 틀 — 본문 4자·id 1·class 5(글꼴 변수·Tailwind).
// 옛 조건(id+class 5개 미만)은 이 틀을 앱 화면으로 봐서 셀렉터 8개를 전부 "없음"이라 했다.
const nextShell = `<!DOCTYPE html><html lang="ko" class="__variable_1a2b3c __variable_4d5e6f"><head><meta charSet="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/_next/static/css/app.css" data-precedence="next"/>
<script src="/_next/static/chunks/webpack.js" async=""></script><title>스킨로그</title></head>
<body class="antialiased bg-app text-ink"><div id="modal-root"></div><!--$--><!--/$-->
<script>(self.__next_f=self.__next_f||[]).push([0])</script><script>self.__next_f.push([1,"x"])</script></body></html>`;
const ni = indexHtml(nextShell);
ok("넥스트 빈 틀 픽스처 = 실측 모양(본문 4자·id+class 6개)", ni.textChars === 4 && ni.ids.size + ni.classes.size === 6, `text=${ni.textChars} ids=${ni.ids.size} classes=${ni.classes.size}`);
ok("넥스트 빈 틀 → JS 셸(본문 80자 미만이면 id·class 수와 무관)", looksJsRendered(ni));

// ── (4) 로봇이 여는 주소 조립 ──
ok("상대 url + params", composeProbeUrl("https://a.test/", { url: "/app/", params: { demo: "1" } }) === "https://a.test/app/?demo=1");
ok("절대 url은 그대로", composeProbeUrl("https://a.test/", { url: "https://b.test/demo" }) === "https://b.test/demo");
ok("access 없으면 base", composeProbeUrl("https://a.test/x?y=1", null) === "https://a.test/x?y=1");
ok("params만", composeProbeUrl("https://a.test/app/", { noLogin: true, params: { guest: "1" } }) === "https://a.test/app/?guest=1");

// ── (5) 첫 화면 / 뒤 화면 ──
// 스킨로그가 09-15에 실제로 보낸 대본(8스텝) — 1번 click이 첫 화면을 떠난다.
const skinlog: DemoScript = {
  steps: [
    { goal: "코치 순위표", selector: 'nav[data-tabbar] a[href="/coach"]', action: "click" },
    { goal: "순위표 확대", selector: '[data-message-id="demo-msg-4"]', action: "focus" },
    { goal: "제품 탭", selector: 'nav[data-tabbar] a[href="/shelf"]', action: "click" },
    { goal: "검색", selector: 'input[placeholder^="제품 이름"]', action: "type", text: "선크림" },
    { goal: "첫 결과", selector: 'input[placeholder^="제품 이름"] ~ ul li:first-child button', action: "click" },
    { goal: "제품 목록", selector: '[data-tab="products"]', action: "click" },
    { goal: "토너 폴더", selector: 'a[href="/shelf/folders/demo-folder-toner"]', action: "click" },
    { goal: "토너 6위", selector: 'a[href="/shelf/demo-toner-6"]', action: "click" },
  ],
};
const kg = selectorsOf(skinlog);
ok("스킨로그: 첫 화면 = 1번 click 셀렉터 하나, 뒤 화면 7개",
  kg.entry.length === 1 && kg.entry[0] === 'nav[data-tabbar] a[href="/coach"]' && kg.later.length === 7, JSON.stringify(kg));
const kc = checkSelectorsInHtml(nextShell, kg, "https://skin.test/demo");
ok("스킨로그 대본 × 넥스트 빈 틀 → 확인 불가(없음 0개)", kc.status === "skipped" && kc.reason === "js-rendered" && kc.missing.length === 0, JSON.stringify(kc));

const tour: DemoScript = {
  steps: [
    { goal: "히어로", selector: "#hero", action: "focus" },
    { goal: "기능 섹션", selector: "#features", action: "scroll" },
    { goal: "카드 옮기기", selector: ".card", toSelector: ".lane-done", action: "drag" },
    { goal: "결과 패널", selector: "#result", action: "focus" },
    { goal: "히어로 다시", selector: "#hero", action: "focus" },
  ],
};
const tg = selectorsOf(tour);
ok("focus·scroll은 같은 화면 → 첫 drag까지 첫 화면(도착지 포함)", tg.entry.join(",") === "#hero,#features,.card,.lane-done", tg.entry.join(","));
ok("뒤 화면은 첫 조작 이후만, 첫 화면에서 이미 센 셀렉터는 다시 안 셈", tg.later.join(",") === "#result", tg.later.join(","));
const ng = selectorsOf({ steps: [{ goal: "a", where: "첫 버튼", action: "click" }, { goal: "b", selector: "#x", action: "focus" }] });
ok("1번이 셀렉터 없는 click → 첫 화면 셀렉터 없음", ng.entry.length === 0 && ng.later.join(",") === "#x", JSON.stringify(ng));

// 정적 본문 HTML(위 html)에 대보기
const m1 = checkSelectorsInHtml(html, { entry: ["#refreshBtn"], later: ["#after-click-panel", ".modal-open"] });
ok("여러 화면 대본: 첫 화면만 판정(checked 1·found 1·missing 0)", m1.status === "checked" && m1.checked === 1 && m1.found === 1 && m1.missing.length === 0, JSON.stringify(m1));
ok("뒤 화면 셀렉터는 이 HTML에 없어도 later로만 실림", m1.later.join("|") === "#after-click-panel|.modal-open");
const m2 = checkSelectorsInHtml(html, { entry: ["#refresh-btn"], later: [".todo-list li"] });
ok("첫 화면 오타 + 다른 셀렉터는 맞음 → checked·missing엔 첫 화면 것만",
  m2.status === "checked" && m2.found === 0 && m2.missing.join("|") === "#refresh-btn", JSON.stringify(m2));
const m3 = checkSelectorsInHtml(html, { entry: ["#nope-a"], later: ["#nope-b", ".nope-c"] });
ok("본문은 충분한데 하나도 안 맞음 → skipped/no-match(없음이라 하지 않음)", m3.status === "skipped" && m3.reason === "no-match" && m3.missing.length === 0, JSON.stringify(m3));
const m4 = checkSelectorsInHtml(html, { entry: [":nth-child(2)"], later: ["#refreshBtn"] });
ok("첫 화면 셀렉터가 판정 불가뿐 → skipped/no-entry-selectors",
  m4.status === "skipped" && m4.reason === "no-entry-selectors" && m4.unparsed.join(",") === ":nth-child(2)", JSON.stringify(m4));
ok("첫 화면 셀렉터 없음 → skipped/no-entry-selectors", checkSelectorsInHtml(html, { entry: [], later: ["#refreshBtn"] }).reason === "no-entry-selectors");
ok("셀렉터 없음 → skipped/no-selectors", checkSelectorsInHtml(html, { entry: [], later: [] }).reason === "no-selectors");

// ── (6) 예상 필름 길이(09-16) ──
// 러너 페이싱을 옮겨 온 어림 계산 — 스텝 비용(커서 이동·조작·hold)과 "몇 번째부터 잘리나".
// seconds는 화면에 그대로 찍히는 값이라 0.1초로 반올림해서 나온다 — 기대값도 그 표시값으로 본다.
const fe1 = estimateFilm({ steps: [{ goal: "a", selector: "#a", action: "click" }] });
ok("click 한 스텝 = 커서 1.0 + 정지 0.18 + 기본 hold 0.9 → 2.1", fe1.seconds === 2.1, JSON.stringify(fe1));
ok("예산 30초·안 넘으면 cutFromStep 없음", fe1.budget === 30 && fe1.cutFromStep === null, JSON.stringify(fe1));
const fe2 = estimateFilm({ steps: [{ goal: "t", selector: "#t", action: "type", text: "선크림", hold: 2 }] });
ok("type: 글자당 0.055초 + 준 hold(1.0+0.18+0.165+2 → 3.3)", fe2.seconds === 3.3, JSON.stringify(fe2));
const fe3 = estimateFilm({ steps: [{ goal: "s", selector: "#s", action: "scroll" }] });
ok("scroll은 hold를 안 주면 0.75 → 0.8", fe3.seconds === 0.8, JSON.stringify(fe3));
const fe4 = estimateFilm({ steps: [{ goal: "f", selector: "#f", action: "focus", hold: 9 }] });
ok("hold는 스키마 상한 4초로 자른다", Math.abs(fe4.seconds - (0.7 + 4)) < 0.01, JSON.stringify(fe4));
// 외부 AI가 09-16에 고른 9컷(hold 합 20초) 모양 — 30초를 넘어 뒤 스텝이 못 들어간다.
const nine: DemoScript = {
  steps: Array.from({ length: 9 }, (_, i) => ({
    goal: `beat ${i + 1}`, selector: `#s${i}`, action: "click" as const, hold: i < 8 ? 2.5 : 0.5,
  })),
};
const fe5 = estimateFilm(nine);
ok("9컷 × hold 2.5 → 30초 초과, 잘리는 스텝(9)을 짚는다",
  fe5.seconds > 30 && fe5.cutFromStep === 9, JSON.stringify(fe5));
const fe6 = estimateFilm(sonnet);
ok("소넷 6스텝(focus 5·click 1) = 예산 안", fe6.seconds < 30 && fe6.cutFromStep === null, JSON.stringify(fe6));

console.log(failed ? `\n${failed}건 실패` : "\nALL PASS");
process.exit(failed ? 1 : 0);
