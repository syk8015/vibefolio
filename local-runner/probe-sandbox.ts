// No-API probe: 촬영 Chrome이 샌드박스 안에서 돌고, 워커 열쇠를 물려받지 않는지(2026-11-02, audit-8 B1·B2·B3).
// 진짜 촬영과 같은 함수(launchChromium·launchRecordingContext)로 띄운다 — 화면에 Chrome 창이 잠깐 뜬다.
//   1. Chrome 프로세스 어디에도 --no-sandbox가 없다
//   2. 렌더러(페이지를 그리는 프로세스)가 macOS 샌드박스로 떴다(--seatbelt-client)
//   3. Chrome에 넘기는 환경변수에 워커 열쇠가 없다(가짜 열쇠를 심고 찾는다). macOS는 남의 프로세스
//      환경변수를 ps로 못 읽어서(SIP), 띄운 Chrome이 아니라 넘기는 값(childEnv)을 본다 — Playwright의 env는
//      process.env와 합치지 않고 그대로 바꿔 끼운다.
//   4. 그래도 페이지는 제대로 그려진다(GPU 길) · 서비스 워커는 막혀 있다
// Anthropic/E2B/Supabase는 쓰지 않는다.
//
//   npx tsx local-runner/probe-sandbox.ts
process.env.NF_PROBE_FAKE_SECRET = "probe-fake-secret-value";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { launchChromium, launchRecordingContext } from "./browser";
import { childEnv } from "./util";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `  (${detail})` : ""}`);
  if (ok) pass++; else fail++;
}

const chromePids = (): Set<number> =>
  new Set(
    execFileSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" })
      .split("\n")
      .filter((l) => l.includes("Google Chrome"))
      .map((l) => Number(l.trim().split(/\s+/)[0]))
      .filter(Boolean),
  );
const cmdOf = (pid: number) => {
  try { return execFileSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8" }); } catch { return ""; }
};

// 서비스 워커를 등록하려는 작은 페이지(같은 출처라야 등록이 시도된다).
const server = createServer((req, res) => {
  if (req.url === "/sw.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end("self.addEventListener('fetch',()=>{})"); return; }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`<!doctype html><body style="margin:0;background:#1e90ff"><h1 style="color:#fff">sandbox probe</h1>
<script>window.swResult = navigator.serviceWorker
  ? navigator.serviceWorker.register('/sw.js').catch(() => {}).then(() => new Promise((r) => setTimeout(r, 800)))
      .then(() => navigator.serviceWorker.getRegistrations()).then((l) => l.length ? 'registered' : 'none')
  : Promise.resolve('no api');</script>`);
});
await new Promise<void>((r) => server.listen(8932, "127.0.0.1", r));
const PAGE = "http://127.0.0.1:8932/";

async function inspect(label: string, before: Set<number>) {
  await new Promise((r) => setTimeout(r, 1500));
  const mine = [...chromePids()].filter((p) => !before.has(p));
  const cmds = mine.map(cmdOf);
  check(`${label}: Chrome 프로세스가 떴다`, mine.length > 0, `${mine.length}개`);
  check(`${label}: --no-sandbox 없음`, cmds.length > 0 && cmds.every((c) => !c.includes("--no-sandbox")));
  const renderers = cmds.filter((c) => c.includes("--type=renderer"));
  check(`${label}: 렌더러가 macOS 샌드박스로 뜸`, renderers.length > 0 && renderers.every((c) => c.includes("--seatbelt-client")), `렌더러 ${renderers.length}개`);
}

const env = childEnv({ LANG: "en_US.UTF-8" });
check("넘기는 환경변수에 워커 열쇠 없음", !Object.keys(env).some((k) => /SECRET|KEY|TOKEN|PASS/i.test(k)) && !("NF_PROBE_FAKE_SECRET" in env), Object.keys(env).join(","));
check("넘기는 환경변수에 PATH·HOME은 있음", !!env.PATH && !!env.HOME);

// 1) 탐색 브라우저(launchChromium + 탐색과 같은 컨텍스트 옵션)
{
  const before = chromePids();
  const browser = await launchChromium();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    await page.goto(PAGE);
    await inspect("탐색", before);
    const shot = await page.screenshot();
    check("탐색: 페이지가 그려짐", shot.length > 2000, `${shot.length} bytes`);
  } finally {
    await browser.close();
  }
}

// 2) 녹화 컨텍스트(launchRecordingContext — 실제 촬영 창)
{
  const before = chromePids();
  const { context, page } = await launchRecordingContext();
  try {
    await page.goto(PAGE);
    await inspect("녹화", before);
    const color = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check("녹화: 페이지가 그려짐", color === "rgb(30, 144, 255)", color);
    const sw = await page.evaluate(() => (window as unknown as { swResult: Promise<string> }).swResult);
    check("녹화: 서비스 워커 등록 안 됨", sw === "none", String(sw));
  } finally {
    await context.close();
  }
}

server.close();
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
