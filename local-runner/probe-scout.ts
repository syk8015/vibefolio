// Entry-scout probe (피드백 B-4) — verifies the landing/app pre-flight pick
// WITHOUT recording a take (and without API spend unless --live).
//
//   npx -y tsx local-runner/probe-scout.ts          # no-API assertions
//   npx -y tsx local-runner/probe-scout.ts --live   # + one real vision call on
//                                                     a synthetic "empty app vs
//                                                     rich landing" pair (~$0.02)
//
// Covers the whole carry path that B-4 needed built, since before this the
// runner-up URL never reached the DB at all:
//   normalizeDemoAccess(altUrl) → job.ts entry assembly (relative/absolute/params,
//   impossible short-circuit, sink-side gate) → scoutEntry fake hook + range and
//   read sanitizing → (--live) a real pick that must prefer the informative screen.
import { normalizeDemoAccess } from "../lib/demoAccess";
import { scoutEntry, type ScoutCandidate } from "./scout";

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const live = process.argv.includes("--live");

// ── 1) normalizeDemoAccess: altUrl gets the same shape gate as url ────────────
const okAbs = normalizeDemoAccess({ url: "/app", altUrl: "https://example.com/" });
check("altUrl 절대 URL 통과", okAbs.access?.altUrl === "https://example.com/" && okAbs.access?.url === "/app");

const okPath = normalizeDemoAccess({ altUrl: "/landing" });
check("altUrl 경로형 통과", okPath.access?.altUrl === "/landing");

const bad = normalizeDemoAccess({ url: "https://ok.example", altUrl: "javascript:alert(1)" });
check("altUrl 형식 위반 → bad-url(조용히 버리지 않음)", bad.issue === "bad-url" && bad.access === null);

const badScheme = normalizeDemoAccess({ altUrl: "ftp://example.com" });
check("altUrl 비 http(s) 스킴 거부", badScheme.issue === "bad-url");

const capped = normalizeDemoAccess({ altUrl: `https://example.com/${"a".repeat(900)}` });
check("altUrl 길이 상한 적용", (capped.access?.altUrl?.length ?? 0) <= 500);

const none = normalizeDemoAccess({ url: "/app" });
check("altUrl 없으면 필드 자체가 없음", none.access?.altUrl === undefined);

// ── 2) job.ts entry assembly — 두 후보가 실제로 어떤 주소가 되는가 ────────────
// runJob 자체는 브라우저를 띄우므로, 조립 규칙만 recordDemo 직전 상태로 재현한다.
// (job.ts의 resolveEntry/altEntry와 같은 규칙: 절대 URL은 live_url에서 그대로,
//  경로는 base에 붙고, params는 마지막에, impossible이면 정찰 자체를 끈다.)
const { runJobEntryForProbe } = await import("./job");
const cases: { name: string; got: { url: string; altUrl?: string }; want: { url: string; altUrl?: string } }[] = [
  {
    name: "절대 altUrl(live_url) — 그대로 두 번째 후보로",
    got: runJobEntryForProbe("https://site.example/", "live_url", { altUrl: "https://site.example/app" }),
    want: { url: "https://site.example/", altUrl: "https://site.example/app" },
  },
  {
    name: "경로형 altUrl — base에 해석",
    got: runJobEntryForProbe("https://site.example/", "live_url", { altUrl: "/app" }),
    want: { url: "https://site.example/", altUrl: "https://site.example/app" },
  },
  {
    name: "url + altUrl 동시 — 진입은 url, 후보는 altUrl",
    got: runJobEntryForProbe("https://site.example/", "live_url", { url: "/demo", altUrl: "/app" }),
    want: { url: "https://site.example/demo", altUrl: "https://site.example/app" },
  },
  {
    name: "params는 두 후보 모두에 붙는다",
    got: runJobEntryForProbe("https://site.example/", "live_url", { altUrl: "/app", params: { guest: "1" } }),
    want: { url: "https://site.example/?guest=1", altUrl: "https://site.example/app?guest=1" },
  },
  {
    name: "impossible=true면 정찰 후보를 만들지 않는다(비용 0)",
    got: runJobEntryForProbe("https://site.example/", "live_url", { altUrl: "/app", impossible: true }),
    want: { url: "https://site.example/", altUrl: undefined },
  },
  {
    name: "altUrl이 진입과 같아지면 후보 없음(비교할 게 없음)",
    got: runJobEntryForProbe("https://site.example/app", "live_url", { altUrl: "/app" }),
    want: { url: "https://site.example/app", altUrl: undefined },
  },
  {
    name: "빌드 소스(zip/github)는 altUrl의 origin을 버리고 경로만 샌드박스에 적용",
    got: runJobEntryForProbe("https://sandbox.e2b.dev/", "zip", { altUrl: "https://site.example/app?x=1" }),
    want: { url: "https://sandbox.e2b.dev/", altUrl: "https://sandbox.e2b.dev/app?x=1" },
  },
];
for (const c of cases) {
  check(c.name, c.got.url === c.want.url && c.got.altUrl === c.want.altUrl, `got ${JSON.stringify(c.got)}`);
}

// 사설/로컬 호스트 altUrl은 sink-side 게이트에서 던져야 한다(변조된 행 방어).
let threw = false;
try {
  runJobEntryForProbe("https://site.example/", "live_url", { altUrl: "http://127.0.0.1:3000/app" });
} catch {
  threw = true;
}
check("altUrl 사설 호스트 → sink-side 게이트가 거부", threw);

// ── 3) scoutEntry — 무과금 훅 + 범위/열거 정화 ────────────────────────────────
const px = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);
const pair: ScoutCandidate[] = [
  { url: "https://site.example/", shot: px, loginGated: false },
  { url: "https://site.example/app", shot: px, loginGated: false },
];

process.env.NF_FAKE_SCOUT = "1";
const fake1 = await scoutEntry(pair);
check("NF_FAKE_SCOUT=1 → 두 번째 후보 선택", fake1.index === 1 && fake1.url === pair[1].url && !fake1.failedOpen);

process.env.NF_FAKE_SCOUT = "0";
const fake0 = await scoutEntry(pair);
check("NF_FAKE_SCOUT=0 → 첫 후보 선택", fake0.index === 0 && fake0.url === pair[0].url);

process.env.NF_FAKE_SCOUT = "99";
const fakeOob = await scoutEntry(pair);
check("범위 밖 fake 값도 후보 안으로 clamp", fakeOob.index === pair.length - 1);
delete process.env.NF_FAKE_SCOUT;

// 키가 없으면 FAIL-OPEN — 원래 선언된 진입 URL을 그대로 쓴다(촬영은 계속된다).
const savedKey = process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
const noKey = await scoutEntry(pair);
check("키 없음 → fail-open, 선언된 URL 유지", noKey.index === 0 && noKey.failedOpen);
check("fail-open이어도 reads는 후보 수만큼 채워진다", noKey.reads.length === pair.length);
if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey;

// ── 4) 실제 브라우저 순회 — 후보를 돌며 찍고 로그인 벽을 읽는가 ──────────────
// 파이프라인의 촬영 전 단계(surveyCandidates)를 진짜 Chrome으로 태운다. 이 구간은
// 그동안 실촬영($0.16 한 판) 말고는 검증할 방법이 없었다. 비전 콜은 안 부른다.
{
  const { launchChromium } = await import("./browser");
  const { surveyCandidates } = await import("./scout");
  const { VIEW_W, VIEW_H } = await import("./config");
  const browser = await launchChromium();
  try {
    const ctx = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    // data: URL 3종 — 앱스러운 화면 / 사실상 빈 화면 / 로그인 벽.
    const asData = (html: string) => `data:text/html,${encodeURIComponent(html)}`;
    const appish = asData("<h1>Board</h1><ul><li>Task A</li><li>Task B</li></ul><button>Add</button>");
    const blank = asData("<body style='background:#fff'></body>");
    const wall = asData("<form><h1>Sign in</h1><input type='email'><input type='password'><button>Log in</button></form>");

    const survey = await surveyCandidates(page, [appish, blank, wall], async (u) => {
      await page.goto(u, { waitUntil: "domcontentloaded", timeout: 15000 });
    });
    check("순회가 후보 수만큼 결과를 만든다", survey.length === 3);
    check("후보마다 스크린샷이 실제로 찍힌다", survey.every((c) => c.shot.length > 500));
    check("스크린샷이 서로 다르다(같은 화면 3장 아님)", new Set(survey.map((c) => c.shot.length)).size > 1);
    check("로그인 벽만 loginGated=true", survey.map((c) => c.loginGated).join() === "false,false,true");
    check("순회 후 페이지는 마지막 후보 위에 있다", page.url().startsWith("data:text/html,%3Cform"));
    await ctx.close();
  } finally {
    await browser.close();
  }
}

// ── 5) live: 실제 비전 콜이 "정보량 많은 쪽"을 고르는가 ───────────────────────
if (live) {
  const { run } = await import("./util");
  const { mkdtempSync, rmSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "nf-scout-probe-"));
  try {
    // 후보 A = 사실상 빈 화면(단색), 후보 B = 글자·도형이 있는 패턴.
    const blank = join(dir, "blank.jpg");
    const rich = join(dir, "rich.jpg");
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=white:s=1280x720", "-frames:v", "1", blank], { timeoutMs: 30_000 });
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720", "-frames:v", "1", rich], { timeoutMs: 30_000 });
    const pick = await scoutEntry([
      { url: "https://site.example/app", shot: readFileSync(blank), loginGated: false },
      { url: "https://site.example/", shot: readFileSync(rich), loginGated: false },
    ]);
    console.log(`  live pick: #${pick.index} [${pick.reads.join(", ")}] — ${pick.reason}`);
    check("live: 정찰이 실제로 돌았다(fail-open 아님)", !pick.failedOpen);
    check("live: 빈 화면 대신 정보 있는 쪽 선택", pick.index === 1);
    check("live: 빈 화면을 empty/unclear로 읽는다", ["empty", "unclear"].includes(pick.reads[0]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
} else {
  console.log("(--live 생략: 실제 비전 콜 없음)");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
