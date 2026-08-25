// 무API 프로브: 커서 가시성(2026-08-25 v4 육안 판정 수리).
// 실행: npx -y tsx local-runner/probe-cursor-visibility.ts
//
// 수리한 증상: 33초 필름에서 합성 커서가 ~12초만 화면에 있었고, 있는 동안에도
// 사실상 안 움직였다. 원인은 커서에 "지금 프레임 안에 있나"라는 개념이 없어서
// (창 중앙에 두고 늘 그리기만 함) 카메라가 딴 데를 확대하면 크롭 밖으로 밀려나
// 사라지고, 글라이드도 화면 밖에서 끝나 "텔레포트한 커서가 갑자기 클릭"으로
// 보이던 것. 이 프로브는 촬영 없이 그 구조를 회귀 가드한다.
import { CameraTrack } from "./camera";
import { launchChromium } from "./browser";
import {
  ensureCursor, injectCursorOverlay, cursorShow, cursorHide, cursorVisible, cursorSetPos,
} from "./cursor";
import { CURSOR_FADE_MS, CENTER_BIAS } from "./config";

let failed = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    failed++;
    console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const VW = 1280;
const VH = 800;
const inside = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// ── 1. visibleRect = 후처리 크롭과 같은 영역 ──────────────────────────────────
console.log("[1] 보이는 영역 계산");
assert("CENTER_BIAS=1 전제(다르면 아래 기대값 재검토)", CENTER_BIAS === 1.0, `${CENTER_BIAS}`);

const cam = new CameraTrack(Date.now(), VW, VH);
const wide = cam.visibleRect();
assert("1x면 창 전체", wide.x === 0 && wide.y === 0 && wide.w === VW && wide.h === VH,
  JSON.stringify(wide));
assert("1x면 창 안 어디든 프레임 안", cam.contains({ x: 5, y: 5 }) && cam.contains({ x: VW - 5, y: VH - 5 }));

// 오른쪽 아래 구석을 확대 → 크롭이 창 밖으로 나가지 않게 클램프돼야 한다.
cam.focusRegion({ x: VW - 60, y: VH - 60 }, 200, 120, 700);
const cornerRect = cam.visibleRect();
assert("확대 크롭이 창 밖으로 안 나감",
  cornerRect.x >= 0 && cornerRect.y >= 0 &&
  cornerRect.x + cornerRect.w <= VW + 0.001 && cornerRect.y + cornerRect.h <= VH + 0.001,
  JSON.stringify(cornerRect));
assert("확대 중엔 창 전체보다 좁다", cornerRect.w < VW && cornerRect.h < VH,
  `${cornerRect.w}×${cornerRect.h}`);

// 옛 구조에서 커서가 사라지던 조건 ①: 구석을 확대하면 **창 중앙**(예전의 커서
// 대기 위치)이 프레임 가장자리로 밀려난다. 커서 반지름(≈24px)만큼의 여백을 두고
// 보면 "화면에 온전히 있는" 상태가 아니다 — 실측상 정확히 크롭 모서리에 걸린다.
const centerWhole = cam.contains({ x: VW / 2, y: VH / 2 }, 24);
assert("구석 확대 중엔 창 중앙이 프레임에 온전히 안 들어옴(모서리에 걸림)",
  !centerWhole, JSON.stringify(cam.visibleRect()));

// ── 2. entryPointFor = 항상 프레임 안, 목표에서 떨어진 곳 ─────────────────────
console.log("[2] 커서 등장 지점");
const cases: Array<{ label: string; target: { x: number; y: number } }> = [
  { label: "구석 확대 안의 목표", target: { x: VW - 80, y: VH - 80 } },
  { label: "프레임 중앙 목표", target: { x: cornerRect.x + cornerRect.w / 2, y: cornerRect.y + cornerRect.h / 2 } },
];
for (const c of cases) {
  const entry = cam.entryPointFor(c.target);
  assert(`${c.label}: 등장 지점이 보이는 프레임 안`, inside(entry, cam.visibleRect()),
    `entry=${JSON.stringify(entry)} rect=${JSON.stringify(cam.visibleRect())}`);
  const d = Math.hypot(entry.x - c.target.x, entry.y - c.target.y);
  assert(`${c.label}: 목표와 겹치지 않음(글라이드가 보이도록)`, d > 30, `dist=${d.toFixed(1)}`);
}

// 와이드에서도 같은 성질 — 1x에선 넉넉히 떨어질 수 있어야 한다.
const camWide = new CameraTrack(Date.now(), VW, VH);
const wideEntry = camWide.entryPointFor({ x: 300, y: 400 });
assert("1x 등장 지점도 창 안", inside(wideEntry, camWide.visibleRect()), JSON.stringify(wideEntry));
assert("1x 등장 지점은 목표에서 100px 이상",
  Math.hypot(wideEntry.x - 300, wideEntry.y - 400) > 100);

// ── 3. 오버레이 실기동: 설치 직후 숨김 → show → hide ──────────────────────────
console.log("[3] 오버레이 실기동 (실 Chrome, 무API)");
const browser = await launchChromium();
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: 1,
  locale: "en-US",
});
const page = await ctx.newPage();
await injectCursorOverlay(page);
await page.goto("data:text/html,<body style='background:#fff;margin:0'><h1>probe</h1></body>");
await ensureCursor(page);

// 캔버스에 실제로 찍힌 픽셀 수 — "그리는 척"이 아니라 화면에 있는지를 본다.
const painted = () =>
  page.evaluate(() => {
    const c = document.getElementById("__nf_cursor_canvas") as HTMLCanvasElement | null;
    if (!c) return -1;
    const g = c.getContext("2d")!;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  });

await cursorSetPos(page, VW / 2, VH / 2);
await new Promise((r) => setTimeout(r, 120));
assert("설치 직후 visible()=false", (await cursorVisible(page)) === false);
assert("설치 직후 캔버스가 비어 있음", (await painted()) === 0, `painted=${await painted()}`);

await cursorShow(page, CURSOR_FADE_MS);
assert("show() 후 visible()=true", (await cursorVisible(page)) === true);
const shown = await painted();
assert("show() 후 커서가 실제로 그려짐", shown > 200, `painted=${shown}`);

await cursorHide(page, CURSOR_FADE_MS);
assert("hide() 후 visible()=false", (await cursorVisible(page)) === false);
assert("hide() 후 캔버스가 다시 비어 있음", (await painted()) === 0, `painted=${await painted()}`);

// 이미 숨김이면 hide()는 아무것도 안 한다(불필요한 220ms 지연 방지).
const t0 = Date.now();
await cursorHide(page, CURSOR_FADE_MS);
assert("이미 숨김이면 hide()는 즉시 반환", Date.now() - t0 < CURSOR_FADE_MS, `${Date.now() - t0}ms`);

// 옛 구조에서 커서가 사라지던 조건 ②(프로브로 새로 찾음): 창 크기가 바뀌면
// 캔버스가 지워지는데 애니메이션 루프는 멈춰 있어 아무도 다시 안 그렸다.
await cursorShow(page, CURSOR_FADE_MS);
const beforeResize = await painted();
await page.setViewportSize({ width: VW - 80, height: VH - 40 });
await new Promise((r) => setTimeout(r, 300));
const afterResize = await painted();
assert("창 크기가 바뀌어도 보이던 커서는 계속 보인다",
  beforeResize > 200 && afterResize > 200, `${beforeResize} → ${afterResize}`);
await cursorHide(page, CURSOR_FADE_MS);

// 페이지 이동 후에도 숨김으로 재설치 — 옛 필름의 "17초 정중앙 팝업"의 정체.
await page.goto("data:text/html,<body style='background:#fff;margin:0'><h2>after nav</h2></body>");
await ensureCursor(page);
await new Promise((r) => setTimeout(r, 120));
assert("페이지 이동 직후에도 숨김 상태", (await cursorVisible(page)) === false);
assert("페이지 이동 직후 캔버스도 비어 있음", (await painted()) === 0);

await browser.close();

console.log(failed === 0 ? "\n전부 통과" : `\n${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);
