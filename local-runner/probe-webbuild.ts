// 폰 앱 → 웹 빌드 경로 프로브 (2026-08-26, 유형 커버리지 ②) — real E2B, no Anthropic API.
//
//   Part 1  detection: detectWebBuild() is pure over repoFiles, so the whole
//           matrix (flutter / expo / bare RN / monorepo nesting / negatives)
//           runs with no sandbox at all. Plus pickZipAnchor: a Flutter source
//           zip must anchor on pubspec.yaml, NOT on its shell web/index.html.
//   Part 2  flutter E2E: `flutter create` inside the sandbox → serveFlutterWeb()
//           → the served page really is the built app (flutter_bootstrap.js).
//           This is also the proof that the template's baked SDK works.
//   Part 3  expo E2E: create-expo-app → serveExpoWeb() → export → served.
//
// Run: npx tsx --env-file=.env.local local-runner/probe-webbuild.ts
//      (--skip-e2e for part 1 only; --skip-expo to stop after flutter)
// Cost: E2B sandbox minutes only (a few cents). Part 2+3 take ~8 minutes.
import { Sandbox } from "e2b";
import { detectWebBuild, serveFlutterWeb, serveExpoWeb } from "./build";
import { pickZipAnchor } from "../lib/upload-safety";

// e2b의 commands.run은 non-zero에서 던진다 — 프로브는 종료코드를 보고 싶다.
async function run(sandbox: Sandbox, cmd: string, timeoutMs?: number) {
  try {
    const r = await sandbox.commands.run(cmd, timeoutMs ? { timeoutMs } : undefined);
    return { exitCode: r.exitCode, stdout: r.stdout ?? "" };
  } catch (e) {
    const err = e as { exitCode?: number; stdout?: string; result?: { exitCode?: number; stdout?: string } };
    const r = typeof err?.exitCode === "number" ? err : err?.result;
    if (r && typeof r.exitCode === "number") return { exitCode: r.exitCode, stdout: r.stdout ?? "" };
    throw e;
  }
}

let pass = 0;
let fail = 0;
function assert(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const FLUTTER_PUBSPEC = `name: probe_app
environment:
  sdk: '>=3.0.0 <4.0.0'
dependencies:
  flutter:
    sdk: flutter
flutter:
  uses-material-design: true
`;

// A pure Dart package (no flutter section, no flutter sdk dep) is NOT a phone app.
const DART_PUBSPEC = `name: dart_util
environment:
  sdk: '>=3.0.0 <4.0.0'
dependencies:
  http: ^1.0.0
`;

const pkg = (deps: Record<string, string>) =>
  JSON.stringify({ name: "probe", scripts: { start: "x" }, dependencies: deps });

function partOne() {
  console.log("[probe] part 1 — detection (pure, no sandbox)");

  const flutter = detectWebBuild({ "pubspec.yaml": FLUTTER_PUBSPEC });
  assert("flutter pubspec detected", flutter?.kind === "flutter", JSON.stringify(flutter));
  assert("flutter dir = repo root", flutter?.dir === "", JSON.stringify(flutter));

  const nested = detectWebBuild({
    "packages/app/pubspec.yaml": FLUTTER_PUBSPEC,
    "package.json": pkg({ next: "15" }),
  });
  assert("monorepo flutter dir = packages/app", nested?.dir === "packages/app", JSON.stringify(nested));

  assert(
    "pure dart package → not a phone app",
    detectWebBuild({ "pubspec.yaml": DART_PUBSPEC }) === null,
    JSON.stringify(detectWebBuild({ "pubspec.yaml": DART_PUBSPEC })),
  );

  const expo = detectWebBuild({ "package.json": pkg({ expo: "57.0.0", react: "19" }) });
  assert("expo detected", expo?.kind === "expo", JSON.stringify(expo));

  const router = detectWebBuild({ "package.json": pkg({ "expo-router": "4" }) });
  assert("expo-router alone detected", router?.kind === "expo", JSON.stringify(router));

  const bare = detectWebBuild({ "package.json": pkg({ "react-native": "0.76" }) });
  assert("bare react-native detected", bare?.kind === "react-native", JSON.stringify(bare));

  const both = detectWebBuild({ "package.json": pkg({ expo: "57", "react-native": "0.76" }) });
  assert("expo wins over bare react-native", both?.kind === "expo", JSON.stringify(both));

  assert(
    "plain Next.js app is untouched",
    detectWebBuild({ "package.json": pkg({ next: "15", react: "19" }) }) === null,
  );
  assert("empty repo → null", detectWebBuild({}) === null);
  assert(
    "unparsable package.json → null (JS branch handles it)",
    detectWebBuild({ "package.json": "{ broken" }) === null,
  );
  assert(
    "flutter beats a nested JS package.json",
    detectWebBuild({ "pubspec.yaml": FLUTTER_PUBSPEC, "web/package.json": pkg({ expo: "57" }) })?.kind ===
      "flutter",
  );

  // zip 앵커: 껍데기 web/index.html이 pubspec을 가려서는 안 된다.
  const flutterZip = pickZipAnchor([
    { relativePath: "web/index.html" },
    { relativePath: "pubspec.yaml" },
    { relativePath: "lib/main.dart" },
  ]);
  assert("flutter zip anchors on pubspec.yaml", flutterZip?.path === "pubspec.yaml", JSON.stringify(flutterZip));
  assert("flutter zip anchor is runnable (not embedded)", flutterZip?.kind === "runnable");

  const builtZip = pickZipAnchor([{ relativePath: "index.html" }, { relativePath: "main.dart.js" }]);
  assert(
    "already-built flutter output still anchors on index.html",
    builtZip?.path === "index.html" && builtZip.kind === "html",
    JSON.stringify(builtZip),
  );

  const staticZip = pickZipAnchor([{ relativePath: "index.html" }, { relativePath: "style.css" }]);
  assert("plain static zip unchanged", staticZip?.kind === "html", JSON.stringify(staticZip));
}

async function partTwoFlutter(sandbox: Sandbox) {
  console.log("[probe] part 2 — flutter create → build web → serve (real E2B)");
  const root = "/tmp/flutter_probe"; // dart 패키지명 규칙: 하이픈 불가
  // 파이프(`| tail`)로 감싸면 종료코드가 tail의 것이 되어 실패가 통째로 가려진다
  // (첫 실행에서 실제로 당함) — 출력은 파일로 빼고 종료코드는 그대로 본다.
  const create = await run(
    sandbox,
    `export PATH=/opt/flutter/bin:$PATH && flutter create --platforms=web ${root} > /tmp/create.log 2>&1`,
    300_000,
  );
  const createLog = await sandbox.commands.run("tail -5 /tmp/create.log");
  assert("flutter create succeeded", create.exitCode === 0, createLog.stdout.slice(-400));
  if (create.exitCode !== 0) return;

  const built = await serveFlutterWeb(sandbox, root, { kind: "flutter", dir: "" }, {});
  assert("serveFlutterWeb returned a url", !!built.url, built.url);
  const res = await fetch(built.url, { signal: AbortSignal.timeout(15_000) });
  const body = await res.text();
  assert("served page is 200", res.status === 200, String(res.status));
  assert(
    "served page is the flutter build, not the source shell",
    /flutter_bootstrap\.js|main\.dart\.js/.test(body),
    body.slice(0, 200),
  );
  // The shell in the source tree carries this placeholder; the built one does not.
  assert("shell placeholder is gone", !/\$FLUTTER_BASE_HREF/.test(body));
}

async function partThreeExpo(sandbox: Sandbox) {
  console.log("[probe] part 3 — create-expo-app → web export → serve (real E2B)");
  const root = "/tmp/expo-probe";
  const create = await run(
    sandbox,
    `export PATH=/opt/node/bin:$PATH && npx --yes create-expo-app@latest ${root} --template blank --no-install > /tmp/expo-create.log 2>&1`,
    300_000,
  );
  const createLog = await sandbox.commands.run("tail -8 /tmp/expo-create.log");
  assert("create-expo-app succeeded", create.exitCode === 0, createLog.stdout.slice(-400));
  if (create.exitCode !== 0) return;

  const manifest = await sandbox.files.read(`${root}/package.json`, { format: "text" });
  const detected = detectWebBuild({ "package.json": String(manifest) });
  assert("generated expo app is detected as expo", detected?.kind === "expo", JSON.stringify(detected));

  const built = await serveExpoWeb(sandbox, root, { kind: "expo", dir: "" }, {});
  assert("serveExpoWeb returned a url", !!built.url, built.url);
  const res = await fetch(built.url, { signal: AbortSignal.timeout(15_000) });
  const body = await res.text();
  assert("served page is 200", res.status === 200, String(res.status));
  assert("served page loads the exported bundle", /<script[^>]+src=/.test(body), body.slice(0, 200));
}

async function main() {
  partOne();

  if (process.argv.includes("--skip-e2e")) {
    console.log("[probe] --skip-e2e — stopping after detection");
  } else {
    // 파트마다 **새 샌드박스**: 프로덕션도 잡 하나에 샌드박스 하나이고, 한 곳에서
    // 두 번 serveStatic하면 두 번째가 3000 포트를 못 잡는다(첫 실행에서 겪음).
    for (const part of [partTwoFlutter, partThreeExpo]) {
      if (part === partThreeExpo && process.argv.includes("--skip-expo")) break;
      const sandbox = await Sandbox.create("nookframe-builder", { timeoutMs: 1_800_000 });
      console.log(`[probe] sandbox ${sandbox.sandboxId}`);
      try {
        if (part === partTwoFlutter) {
          const ver = await run(sandbox, "export PATH=/opt/flutter/bin:$PATH && flutter --version | head -1");
          assert("template ships the flutter SDK", /Flutter\s+\d/.test(ver.stdout), ver.stdout.slice(0, 120));
        }
        await part(sandbox);
      } finally {
        await sandbox.kill().catch(() => {});
      }
    }
  }

  console.log(`\n[probe] ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
