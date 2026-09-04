// E2B build/serve — the cloud half of the M2 split (plan §3): untrusted user code
// (github clone / zip upload) is installed and dev-served ONLY inside an E2B
// sandbox; the local M5 worker receives nothing but the sandbox's public URL and
// records it with a real GPU. The sandbox here builds and serves, nothing else
// (the all-cloud build+record path this was ported from was removed 2026-09-04).
//
// New for M2: while the source sits expanded in the sandbox we collect its
// env/schema/config files so safety.ts's decidePolicy() can pick read-only vs
// full interaction (plan §4.5 — remote DB detected → read-only, verified-local
// only → full, ambiguous → read-only).
// NOTE: named import — under real ESM (tsx) the package's default export is the
// module namespace object, not the Sandbox class.
import { Sandbox } from "e2b";
import { apiPost, fetchSigned } from "./api";
import { BuildFailedError, NotAWebappError } from "./errors";
import { detectNativeApp } from "../lib/nativeApp";

// Single-quote a value so it is always exactly ONE shell argument, regardless of
// metacharacters (sink-hardening: a repo URL like
// `https://x/$(curl evil)` must never run inside the sandbox shell).
function shQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// e2b v2의 `commands.run`은 종료코드가 0이 아니면 CommandExitError를 **던진다**.
// 아래 곳곳의 `if (exitCode !== 0)`는 그 사실을 모른 채 쓰여 실제로는 닿지 않았고
// (2026-08-26 폰 앱 프로브에서 발각), 그래서 clone/install 실패가 분류된
// BuildFailedError("[build-failed] 진짜 이유") 대신 raw 예외로 새어 나가 대시보드에
// "error"로 찍혔다. 결과를 그대로 받아 판단하고 싶은 자리는 전부 이걸 쓴다.
// (`test -f x && echo ok` 같은 판정용 명령도 여기 해당 — 파일이 없으면 exit 1이다.)
async function runSoft(
  sandbox: Sandbox,
  cmd: string,
  opts?: { timeoutMs?: number },
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const r = await sandbox.commands.run(cmd, opts);
    return { exitCode: r.exitCode, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } catch (e) {
    // CommandExitError는 CommandResult를 구현하지만, SDK 버전에 따라 result에 싸여
    // 오기도 한다 — 둘 다 받아준다. 그 외(네트워크·타임아웃)는 그대로 올린다.
    const err = e as { exitCode?: number; stdout?: string; stderr?: string; result?: { exitCode?: number; stdout?: string; stderr?: string } };
    const r = typeof err?.exitCode === "number" ? err : err?.result;
    if (r && typeof r.exitCode === "number") {
      return { exitCode: r.exitCode, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    }
    throw e;
  }
}

const SANDBOX_TIMEOUT_MS = 900_000;
// After the dev server is ready we re-arm the sandbox lifetime so a slow install
// can't eat the recording window (explore alone may take up to 4 minutes).
const SERVE_EXTENSION_MS = 900_000;
const CLONE_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 600_000;
const READY_TIMEOUT_MS = 90_000;
const DEV_PORT = 3000;
const NODE_PATH_PREFIX = "export PATH=/opt/node/bin:$PATH && ";

// Terminal (CLI) demo path: what the ttyd take needs to brief the robot with.
// commands = invocable entry points (package.json bin names / python entry),
// readme = usage excerpt. Both UNTRUSTED repo data — explore frames them as data.
export type TerminalInfo = {
  runtime: "node" | "python";
  commands: string[];
  readme: string;
};

export type BuiltApp = {
  url: string; // public https URL of the sandbox dev server
  sandboxId: string;
  repoFiles: Record<string, string>; // env/schema/config contents for decidePolicy
  // Present when the take is a live terminal (ttyd), not a web app — job.ts
  // forces policy "full" (everything runs inside the disposable sandbox) and
  // pipeline/explore switch to the terminal briefing.
  terminal?: TerminalInfo;
  close: () => Promise<void>;
};

// Storage reads used to happen here with the service-role key. They are now a
// signed-URL fetch: the server lists the project's own zip prefix, checks it
// belongs to the owner, and hands back time-limited download URLs (see
// app/api/worker/assets, op "source-list").
type SourceFile = { path: string; url: string };

async function listSourceFiles(projectId: string): Promise<{ prefix: string; files: SourceFile[] }> {
  return apiPost<{ prefix: string; files: SourceFile[] }>("/api/worker/assets", {
    op: "source-list",
    projectId,
  });
}

// Collect the files decidePolicy scans (env/prisma/config), bounded so a huge
// repo can't balloon this into minutes: depth ≤3, ≤40 files, ≤64KB each.
async function collectRepoFiles(
  sandbox: Sandbox,
  repoPath: string,
): Promise<Record<string, string>> {
  const find = await sandbox.commands.run(
    `cd ${shQuote(repoPath)} && find . -maxdepth 3 -type f ` +
      `\\( -name '.env*' -o -name '*.prisma' -o -name 'package.json' ` +
      `-o -name '*.config.*' -o -name '*.toml' -o -name '*.yml' -o -name '*.yaml' \\) ` +
      `-not -path './node_modules/*' | head -40`,
  );
  const files: Record<string, string> = {};
  for (const line of find.stdout.split("\n")) {
    const rel = line.trim().replace(/^\.\//, "");
    if (!rel) continue;
    try {
      const text = await sandbox.files.read(`${repoPath}/${rel}`, { format: "text" });
      files[rel] = String(text).slice(0, 64_000);
    } catch {
      // unreadable (binary/permissions) — skip; decidePolicy defaults to deny anyway
    }
  }
  return files;
}

// ── 폰 앱 → 웹 빌드 (2026-08-26, 유형 커버리지 ②) ────────────────────────────
// A phone app has no browser face, so it used to leave with no film at all:
// Flutter shipped its shell `web/index.html` and recorded as a blank cream page,
// Expo/RN coasted into `npm run start` and died when Metro never answered on the
// dev port. Both frameworks, though, have a first-party web target — Flutter's
// `build web` and Expo's `export --platform web` — so the source we already have
// is enough to produce the real, interactive app in a browser. That is what we
// film. What this does NOT reach: Swift/Kotlin native (no web target exists).
//
// Detection is pure over repoFiles (probe-webbuild.ts asserts it) and runs BEFORE
// the JS dev-script branch, because an Expo package.json always has a `start`.
export type WebBuildKind = "flutter" | "expo" | "react-native";

export type WebBuildTarget = {
  kind: WebBuildKind;
  dir: string; // repo-relative app dir ("" = repo root) — monorepos nest the app
};

// `flutter:`(assets/uses-material-design block) or `sdk: flutter`(the dependency
// form) — a plain Dart package's pubspec has neither and is not a phone app.
const FLUTTER_PUBSPEC_RE = /(^|\n)\s*(flutter:|sdk:\s*flutter\b)/;

export function detectWebBuild(repoFiles: Record<string, string>): WebBuildTarget | null {
  const depth = (p: string) => p.split("/").length;
  const dirOf = (manifest: string, name: string) =>
    manifest === name ? "" : manifest.slice(0, -(name.length + 1));

  const pubspecs = Object.keys(repoFiles)
    .filter((p) => p === "pubspec.yaml" || p.endsWith("/pubspec.yaml"))
    .filter((p) => FLUTTER_PUBSPEC_RE.test(repoFiles[p] ?? ""))
    .sort((a, b) => depth(a) - depth(b));
  if (pubspecs.length) return { kind: "flutter", dir: dirOf(pubspecs[0], "pubspec.yaml") };

  const pkgs = Object.keys(repoFiles)
    .filter((p) => p === "package.json" || p.endsWith("/package.json"))
    .sort((a, b) => depth(a) - depth(b));
  for (const p of pkgs) {
    let deps: Record<string, string> = {};
    try {
      const j = JSON.parse(repoFiles[p] ?? "") as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      deps = { ...j.dependencies, ...j.devDependencies };
    } catch {
      continue; // unparsable manifest — the JS branch will fail it loudly enough
    }
    const dir = dirOf(p, "package.json");
    if (deps.expo || deps["expo-router"]) return { kind: "expo", dir };
    // Bare React Native (no Expo). The web export still often works — Expo's CLI
    // bundles any RN tree through react-native-web — and the alternative is a
    // guaranteed failure, so it is worth the two minutes.
    if (deps["react-native"]) return { kind: "react-native", dir };
  }
  return null;
}

const FLUTTER_BUILD_TIMEOUT_MS = 600_000;
const WEB_EXPORT_TIMEOUT_MS = 600_000;
const FLUTTER_PATH_PREFIX = "export PATH=/opt/flutter/bin:$PATH && ";

export async function serveFlutterWeb(
  sandbox: Sandbox,
  repoPath: string,
  target: WebBuildTarget,
  repoFiles: Record<string, string>,
): Promise<BuiltApp> {
  const appDir = target.dir ? `${repoPath}/${target.dir}` : repoPath;
  // `flutter build web` runs `pub get` itself. --no-tree-shake-icons skips the
  // icon-subsetting pass, which is the step most likely to fail on a repo using
  // custom icon fonts and buys nothing at demo scale.
  const build = await runSoft(
    sandbox,
    `${FLUTTER_PATH_PREFIX}cd ${shQuote(appDir)} && ` +
      `flutter build web --release --no-tree-shake-icons > /tmp/build.log 2>&1`,
    { timeoutMs: FLUTTER_BUILD_TIMEOUT_MS },
  );
  console.log(`[build] flutter build web exit ${build.exitCode}`);
  if (build.exitCode !== 0) {
    const tail = await sandbox.commands.run("tail -40 /tmp/build.log");
    throw new BuildFailedError(`flutter build web failed (exit ${build.exitCode}): ${tail.stdout.slice(-600)}`);
  }
  const out = `${appDir}/build/web`;
  const exists = await runSoft(sandbox, `test -f ${shQuote(`${out}/index.html`)} && echo ok`);
  if (exists.stdout.trim() !== "ok") {
    throw new BuildFailedError("flutter build web reported success but produced no build/web/index.html");
  }
  console.log(`[build] flutter web build → serving ${out}`);
  return await serveStatic(sandbox, out, repoFiles);
}

export async function serveExpoWeb(
  sandbox: Sandbox,
  repoPath: string,
  target: WebBuildTarget,
  repoFiles: Record<string, string>,
): Promise<BuiltApp> {
  const appDir = target.dir ? `${repoPath}/${target.dir}` : repoPath;
  const install = await runSoft(
    sandbox,
    `${NODE_PATH_PREFIX}cd ${shQuote(appDir)} && npm install --no-audit --no-fund --prefer-offline`,
    { timeoutMs: INSTALL_TIMEOUT_MS },
  );
  console.log(`[build] npm install (expo) exit ${install.exitCode}`);
  if (install.exitCode !== 0) {
    throw new BuildFailedError(`npm install failed (exit ${install.exitCode}): ${(install.stderr || install.stdout || "").slice(-300)}`);
  }
  // The three packages the web target needs. Phone-only projects legitimately
  // ship without them, so add them here rather than failing the export — and for
  // bare React Native, `expo` itself is what provides the exporter.
  const webDeps =
    "react-dom react-native-web @expo/metro-runtime" + (target.kind === "react-native" ? " expo" : "");
  const add = await runSoft(
    sandbox,
    `${NODE_PATH_PREFIX}cd ${shQuote(appDir)} && npx --yes expo install ${webDeps} > /tmp/webdeps.log 2>&1`,
    { timeoutMs: INSTALL_TIMEOUT_MS },
  );
  // Best effort: `expo install` refuses on some bare trees, but the export below
  // still succeeds when the deps were already present. Only the export decides.
  console.log(`[build] expo install web deps exit ${add.exitCode}`);

  const outDir = `${appDir}/dist`;
  const exp = await runSoft(
    sandbox,
    `${NODE_PATH_PREFIX}cd ${shQuote(appDir)} && ` +
      `npx --yes expo export --platform web --output-dir dist > /tmp/build.log 2>&1`,
    { timeoutMs: WEB_EXPORT_TIMEOUT_MS },
  );
  console.log(`[build] expo export --platform web exit ${exp.exitCode}`);
  let serveDir = outDir;
  if (exp.exitCode !== 0) {
    // SDK ≤48 spelled it `export:web` and wrote to web-build/. Cheap second try
    // before giving up on the whole project.
    const legacy = await runSoft(
      sandbox,
      `${NODE_PATH_PREFIX}cd ${shQuote(appDir)} && npx --yes expo export:web >> /tmp/build.log 2>&1`,
      { timeoutMs: WEB_EXPORT_TIMEOUT_MS },
    );
    console.log(`[build] expo export:web (legacy) exit ${legacy.exitCode}`);
    if (legacy.exitCode !== 0) {
      const tail = await sandbox.commands.run("tail -40 /tmp/build.log");
      throw new BuildFailedError(
        `expo web export failed (exit ${exp.exitCode}): ${tail.stdout.slice(-600)}`,
      );
    }
    serveDir = `${appDir}/web-build`;
  }
  const exists = await runSoft(sandbox, `test -f ${shQuote(`${serveDir}/index.html`)} && echo ok`);
  if (exists.stdout.trim() !== "ok") {
    throw new BuildFailedError(`expo web export produced no index.html under ${serveDir}`);
  }
  console.log(`[build] expo web export → serving ${serveDir}`);
  return await serveStatic(sandbox, serveDir, repoFiles);
}

// ── Python web apps (2026-08-20, type-coverage audit ①→확장) ─────────────────
// A repo with no JS dev/start script may still be a Python web app — the most
// common AI-built shape after JS (Streamlit/Gradio especially). Detection keys on
// a *.py file importing a known web framework: requirements.txt alone is too weak
// (utility scripts), and a stray docs/index.html must not shadow the real app,
// which is why this check runs BEFORE the static-HTML fallback.

type PythonFramework = "streamlit" | "gradio" | "dash" | "django" | "fastapi" | "flask";

type PythonApp = {
  framework: PythonFramework;
  entry: string; // repo-relative path of the file importing the framework (django: manage.py)
  ports: number[]; // candidate ports to probe, in order
  // django only — the DJANGO_SETTINGS_MODULE string read out of manage.py. We
  // never edit the creator's settings file; we write a wrapper module next to
  // manage.py that does `from <this> import *` and then opens ALLOWED_HOSTS.
  settingsModule?: string;
};

// Priority: visual app frameworks first — a repo with both a FastAPI backend and
// a Streamlit UI should film the UI. Django sits above FastAPI/Flask because a
// Django project almost always renders real pages, while those two are usually
// JSON APIs in a repo that also has a UI somewhere.
const PY_FRAMEWORKS: PythonFramework[] = ["streamlit", "gradio", "dash", "django", "fastapi", "flask"];

// Django's wrapper settings module (written into the manage.py directory).
const DJANGO_WRAPPER = "nf_demo_settings";

// Entry-file name preference when several files import the same framework.
const PY_ENTRY_RANK = [
  "streamlit_app.py", "app.py", "main.py", "home.py", "server.py", "run.py", "index.py",
];

function pyEntryScore(path: string): number {
  const base = path.split("/").pop() ?? path;
  const nameRank = PY_ENTRY_RANK.indexOf(base);
  const depth = path.split("/").length;
  // name match dominates, then shallowness.
  return (nameRank === -1 ? PY_ENTRY_RANK.length : nameRank) * 100 + depth;
}

// Django never shows up in the import scan below: manage.py's `from django...`
// lives INSIDE main(), indented, so the ^(import|from) anchor can't see it — and
// settings.py imports nothing named django either. The reliable fingerprint is
// manage.py + the DJANGO_SETTINGS_MODULE string it sets. We need that string
// anyway (it names the settings module our wrapper extends), so no string = no
// django claim: better to fall through honestly than to serve DisallowedHost.
async function detectDjango(
  sandbox: Sandbox,
  repoPath: string,
): Promise<{ entry: string; settingsModule: string } | null> {
  const found = await runSoft(
    sandbox,
    `cd ${shQuote(repoPath)} && find . -maxdepth 4 -name manage.py ` +
      `-not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/venv/*' ` +
      `-not -path '*/.git/*' 2>/dev/null | head -10`,
  ).catch(() => null);
  if (!found) return null;
  const paths = found.stdout
    .split("\n")
    .map((l) => l.trim().replace(/^\.\//, ""))
    .filter(Boolean)
    .sort((a, b) => a.split("/").length - b.split("/").length);
  for (const rel of paths) {
    const txt = await sandbox.files.read(`${repoPath}/${rel}`).catch(() => null);
    if (typeof txt !== "string") continue;
    const m = txt.match(/DJANGO_SETTINGS_MODULE["'\s,]+["']([\w.]+)["']/);
    if (m) return { entry: rel, settingsModule: m[1] };
  }
  return null;
}

export async function detectPythonApp(sandbox: Sandbox, repoPath: string): Promise<PythonApp | null> {
  const scan = await sandbox.commands
    .run(
      `cd ${shQuote(repoPath)} && ` +
        `for f in $(grep -RliE '^(import|from)[[:space:]]+(streamlit|gradio|dash|fastapi|flask)\\b' ` +
        `--include='*.py' --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=venv ` +
        `--exclude-dir=.git . 2>/dev/null | head -40); do ` +
        `for fw in streamlit gradio dash fastapi flask; do ` +
        `if grep -qiE "^(import|from)[[:space:]]+$fw\\b" "$f"; then echo "$fw $f"; break; fi; ` +
        `done; done`,
    )
    .catch(() => null);
  const candidates: { framework: PythonFramework; entry: string; settingsModule?: string }[] = [];
  // Django is scanned even when the import grep dies — the two look for different
  // things, and losing a whole framework to an unrelated shell hiccup is not ok.
  const dj = await detectDjango(sandbox, repoPath);
  if (dj) candidates.push({ framework: "django", entry: dj.entry, settingsModule: dj.settingsModule });
  for (const line of (scan?.stdout ?? "").split("\n")) {
    const m = line.trim().match(/^(streamlit|gradio|dash|fastapi|flask) (.+)$/);
    if (!m) continue;
    candidates.push({ framework: m[1] as PythonFramework, entry: m[2].replace(/^\.\//, "") });
  }
  if (!candidates.length) return null;
  candidates.sort(
    (a, b) =>
      PY_FRAMEWORKS.indexOf(a.framework) - PY_FRAMEWORKS.indexOf(b.framework) ||
      pyEntryScore(a.entry) - pyEntryScore(b.entry),
  );
  const best = candidates[0];
  // Everything below forces DEV_PORT via flags/env — except Dash, whose default
  // app.run() ignores env and binds 8050, so that port is probed first.
  const ports = best.framework === "dash" ? [8050, DEV_PORT] : [DEV_PORT];
  return { ...best, ports };
}

export async function servePython(
  sandbox: Sandbox,
  repoPath: string,
  app: PythonApp,
  repoFiles: Record<string, string>,
): Promise<BuiltApp> {
  const venv = "/tmp/pyvenv";
  const py = `${venv}/bin/python`;
  const pip = `${venv}/bin/pip`;
  const mk = await runSoft(sandbox, `python3 -m venv ${venv}`, { timeoutMs: 120_000 });
  if (mk.exitCode !== 0) {
    throw new BuildFailedError(`python venv creation failed (exit ${mk.exitCode}): ${(mk.stderr || mk.stdout || "").slice(-300)}`);
  }

  // Dependencies: requirements.txt > pyproject.toml > just the framework itself
  // (an entry file with zero manifest still deserves a try). FastAPI needs its
  // server installed too — uvicorn is how we launch it.
  const dep = await sandbox.commands.run(
    `cd ${shQuote(repoPath)} && if [ -f requirements.txt ]; then echo req; elif [ -f pyproject.toml ]; then echo proj; else echo none; fi`,
  );
  const mode = dep.stdout.trim();
  const extra = app.framework === "fastapi" ? " uvicorn" : "";
  const installArgs =
    mode === "req" ? `-r requirements.txt${extra}` : mode === "proj" ? `.${extra}` : `${app.framework}${extra}`;
  const install = await runSoft(
    sandbox,
    `cd ${shQuote(repoPath)} && ${pip} install -q --no-input ${installArgs}`,
    { timeoutMs: INSTALL_TIMEOUT_MS },
  );
  console.log(`[build] pip install exit ${install.exitCode} (${mode})`);
  if (install.exitCode !== 0) {
    throw new BuildFailedError(`pip install failed (exit ${install.exitCode}): ${(install.stderr || install.stdout || "").slice(-300)}`);
  }

  const entryQ = shQuote(app.entry);
  // Django prep — two things stand between `manage.py` and a filmable page:
  //   1. ALLOWED_HOSTS. runserver only trusts localhost, but the robot reaches the
  //      app through the sandbox's public host, so stock settings answer 400
  //      DisallowedHost — and the ready-wait below accepts <500, so we would film
  //      the error page. We open it in a WRAPPER module (never by editing the
  //      creator's settings.py): `from <their module> import *`, then override.
  //   2. migrate. A fresh checkout has no sqlite file, so every page 500s on the
  //      first query. Best-effort: an app that needs no migrations is fine too,
  //      and failing hard here would lose screens we could have filmed.
  const djangoDir = app.entry.includes("/") ? app.entry.slice(0, app.entry.lastIndexOf("/")) : ".";
  if (app.framework === "django" && app.settingsModule) {
    await sandbox.files.write(
      `${repoPath}/${djangoDir === "." ? "" : `${djangoDir}/`}${DJANGO_WRAPPER}.py`,
      `from ${app.settingsModule} import *  # noqa: F401,F403
` +
        `ALLOWED_HOSTS = ["*"]
` +
        `DEBUG = True
`,
    );
    const mig = await runSoft(
      sandbox,
      `cd ${shQuote(`${repoPath}/${djangoDir}`)} && ${py} manage.py migrate --noinput ` +
        `--settings ${DJANGO_WRAPPER}`,
      { timeoutMs: 180_000 },
    );
    console.log(`[build] django migrate exit ${mig.exitCode}`);
  }
  let launch: string;
  switch (app.framework) {
    case "streamlit":
      launch =
        `${py} -m streamlit run ${entryQ} --server.address 0.0.0.0 --server.port ${DEV_PORT} ` +
        `--server.headless true --browser.gatherUsageStats false`;
      break;
    case "gradio":
      // gradio reads these envs in demo.launch() — no code change needed.
      launch = `GRADIO_SERVER_NAME=0.0.0.0 GRADIO_SERVER_PORT=${DEV_PORT} ${py} ${entryQ}`;
      break;
    case "dash":
      launch = `HOST=0.0.0.0 PORT=8050 ${py} ${entryQ}`;
      break;
    case "fastapi": {
      // Convention: the ASGI object is named `app`. Anything else fails honestly
      // into dev.log (surfaced by the ready-wait below).
      const mod = app.entry.replace(/\.py$/, "").replace(/\//g, ".");
      launch = `${py} -m uvicorn ${shQuote(`${mod}:app`)} --host 0.0.0.0 --port ${DEV_PORT}`;
      break;
    }
    case "django":
      // --noreload: the autoreloader forks a second process the sandbox never
      // reaps. --settings: our wrapper from above (absent only if manage.py had
      // no DJANGO_SETTINGS_MODULE, which detectDjango refuses to claim).
      launch =
        `cd ${shQuote(djangoDir)} && ${py} manage.py runserver 0.0.0.0:${DEV_PORT} --noreload` +
        (app.settingsModule ? ` --settings ${DJANGO_WRAPPER}` : "");
      break;
    case "flask":
      // flask ≥2.2 accepts a file path for --app.
      launch = `${py} -m flask --app ${entryQ} run --host 0.0.0.0 --port ${DEV_PORT}`;
      break;
  }
  console.log(`[build] python app (${app.framework}) → ${app.entry}`);
  await sandbox.commands.run(
    `cd ${shQuote(repoPath)} && ${launch} > /tmp/dev.log 2>&1`,
    { background: true },
  );

  const deadline = Date.now() + READY_TIMEOUT_MS;
  let url: string | null = null;
  let lastNote = "";
  while (Date.now() < deadline && !url) {
    for (const port of app.ports) {
      const candidate = `https://${sandbox.getHost(port)}`;
      try {
        const res = await fetch(candidate, { signal: AbortSignal.timeout(5000) });
        // django: a 400 here is DisallowedHost (the ALLOWED_HOSTS wrapper didn't
        // take) — treat it as "not up" so we keep waiting and then fail loudly
        // with dev.log, instead of handing the robot an error page to film.
        const usable = res.status < 500 && !(app.framework === "django" && res.status === 400);
        if (usable) {
          url = candidate;
          break;
        }
        lastNote = `status ${res.status} on :${port}`;
      } catch {
        lastNote = "no response yet";
      }
    }
    if (!url) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!url) {
    const tail = await sandbox.commands.run("tail -80 /tmp/dev.log");
    throw new BuildFailedError(
      `Python app (${app.framework}) did not become reachable within ${READY_TIMEOUT_MS / 1000}s (${lastNote}).\n--- dev.log tail ---\n${tail.stdout}`,
    );
  }
  try {
    await sandbox.setTimeout(SERVE_EXTENSION_MS);
  } catch {
    /* older SDK / transient — initial budget usually suffices */
  }
  console.log(`[build] python dev server reachable: ${url}`);
  return {
    url,
    sandboxId: sandbox.sandboxId,
    repoFiles,
    close: async () => {
      await sandbox.kill().catch(() => {});
    },
  };
}

// ── Terminal (CLI) demos (2026-08-20, type-coverage roadmap ②) ────────────────
// A repo that is runnable code but has NO web face at all (Node CLI, Python
// script/bot, backend-only) used to die not-a-webapp. Instead: launch ttyd — a
// live shell rendered as a webpage — inside the sandbox, and let the existing
// browser robot film it by typing commands. Everything the robot runs executes
// in the disposable sandbox; .env* files are deleted first so a command can
// never reach the creator's real remote services with real credentials.

// Last resort by design: only reached when JS scripts, Python web frameworks and
// static HTML all failed to match. package.json wins over stray .py files.
export async function detectTerminalApp(
  sandbox: Sandbox,
  repoPath: string,
  repoFiles: Record<string, string>,
): Promise<TerminalInfo | null> {
  const readme = await sandbox.commands
    .run(
      `cd ${shQuote(repoPath)} && for f in README.md README.MD readme.md README README.rst README.txt; do ` +
        `if [ -f "$f" ]; then head -c 1500 "$f"; break; fi; done`,
    )
    .then((r) => r.stdout.trim())
    .catch(() => "");

  const rawPkg = repoFiles["package.json"];
  if (rawPkg) {
    let commands: string[] = [];
    try {
      const pkg = JSON.parse(rawPkg) as {
        name?: string;
        main?: string;
        bin?: string | Record<string, string>;
      };
      if (typeof pkg.bin === "string") commands = [pkg.name ?? "node ."];
      else if (pkg.bin && typeof pkg.bin === "object") commands = Object.keys(pkg.bin);
      else if (pkg.main) commands = [`node ${pkg.main}`];
      else commands = ["node ."];
    } catch {
      commands = ["node ."];
    }
    return { runtime: "node", commands: commands.slice(0, 5), readme };
  }

  const pyFiles = await sandbox.commands
    .run(
      `cd ${shQuote(repoPath)} && find . -maxdepth 3 -name '*.py' -not -path './node_modules/*' ` +
        `-not -path './.venv/*' -not -path './venv/*' -not -path './.git/*' | head -20`,
    )
    .then((r) => r.stdout.split("\n").map((l) => l.trim().replace(/^\.\//, "")).filter(Boolean))
    .catch(() => [] as string[]);
  if (pyFiles.length) {
    pyFiles.sort((a, b) => pyEntryScore(a) - pyEntryScore(b));
    return { runtime: "python", commands: [`python ${pyFiles[0]}`], readme };
  }

  return null;
}

export async function serveTerminal(
  sandbox: Sandbox,
  repoPath: string,
  term: TerminalInfo,
  repoFiles: Record<string, string>,
): Promise<BuiltApp> {
  // Dependencies, best-effort — a terminal take still films something useful
  // (README, the error itself) when install fails, so nothing here throws.
  if (term.runtime === "node") {
    let hasDeps = false;
    try {
      const pkg = JSON.parse(repoFiles["package.json"] ?? "{}") as {
        dependencies?: object; devDependencies?: object; bin?: unknown;
      };
      hasDeps = !!(pkg.dependencies && Object.keys(pkg.dependencies).length) ||
        !!(pkg.devDependencies && Object.keys(pkg.devDependencies).length);
    } catch { /* unparseable — skip install */ }
    if (hasDeps) {
      const install = await sandbox.commands.run(
        `${NODE_PATH_PREFIX}cd ${repoPath} && npm install --no-audit --no-fund --prefer-offline`,
        { timeoutMs: INSTALL_TIMEOUT_MS },
      ).catch(() => null);
      console.log(`[build] terminal npm install exit ${install?.exitCode ?? "skipped"}`);
    }
    // Make the CLI's bin name invocable by name (npx-style) without root: a
    // user-writable global prefix that the ttyd shell's PATH includes.
    await sandbox.commands.run(
      `${NODE_PATH_PREFIX}cd ${repoPath} && npm install -g --prefix /tmp/npmg --no-audit --no-fund . || true`,
      { timeoutMs: 120_000 },
    ).catch(() => {});
  } else {
    await sandbox.commands.run(`python3 -m venv /tmp/pyvenv`, { timeoutMs: 120_000 }).catch(() => {});
    await sandbox.commands.run(
      `cd ${shQuote(repoPath)} && if [ -f requirements.txt ]; then /tmp/pyvenv/bin/pip install -q --no-input -r requirements.txt; fi`,
      { timeoutMs: INSTALL_TIMEOUT_MS },
    ).catch(() => {});
  }

  // Secret strip — the ONE hard guard of this path: the robot's commands run
  // for real inside the sandbox, and unlike the web paths there is no
  // browser-hop to mock, so a CLI configured with the creator's remote DB/API
  // creds could mutate real data. No .env, no creds, no reach. (decidePolicy
  // already captured these files for its scan; the job forces policy "full".)
  await sandbox.commands.run(
    `find ${shQuote(repoPath)} -maxdepth 5 -name '.env*' -type f -delete`,
  ).catch(() => {});

  // Light theme (라이트 데모 폴리시) + big font: reads well on film and keeps
  // the blank-capture luminance guard meaningful.
  const theme = JSON.stringify({
    background: "#FDFDFB", foreground: "#1F1F1F", cursor: "#1F1F1F",
    selectionBackground: "#BFDBFE",
  });
  await sandbox.files.write(
    "/tmp/ttyrc",
    `export PATH=/tmp/npmg/bin:/tmp/pyvenv/bin:/opt/node/bin:$PATH\ncd ${shQuote(repoPath)}\nexport PS1='$ '\n`,
  );
  await sandbox.commands.run(
    `ttyd -p ${DEV_PORT} -W -t fontSize=22 -t ${shQuote(`theme=${theme}`)} ` +
      `bash --rcfile /tmp/ttyrc > /tmp/dev.log 2>&1`,
    { background: true },
  );

  const host = sandbox.getHost(DEV_PORT);
  const url = `https://${host}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.status < 500) {
        ready = true;
        break;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) {
    const tail = await sandbox.commands.run("tail -40 /tmp/dev.log");
    throw new BuildFailedError(
      `ttyd terminal did not become reachable within ${READY_TIMEOUT_MS / 1000}s.\n--- dev.log tail ---\n${tail.stdout}`,
    );
  }
  try {
    await sandbox.setTimeout(SERVE_EXTENSION_MS);
  } catch {
    /* older SDK / transient — initial budget usually suffices */
  }
  console.log(`[build] terminal (ttyd, ${term.runtime}) reachable: ${url}`);
  return {
    url,
    sandboxId: sandbox.sandboxId,
    repoFiles,
    terminal: term,
    close: async () => {
      await sandbox.kill().catch(() => {});
    },
  };
}

// Serve a static directory (no build step) on the same public port the recorder
// hits. Uses a dependency-free Node http server written into the sandbox — no
// `npx` download, works offline. index.html is the directory default.
async function serveStatic(
  sandbox: Sandbox,
  serveDir: string,
  repoFiles: Record<string, string>,
): Promise<BuiltApp> {
  const server = `
const http=require('http'),fs=require('fs'),path=require('path'),root=${JSON.stringify(serveDir)};
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]);
  if(p.endsWith('/'))p+='index.html';
  const f=path.normalize(path.join(root,p));
  if(!f.startsWith(root)){res.writeHead(403);return res.end('forbidden');}
  fs.readFile(f,(e,b)=>{
    if(e){ // SPA-ish fallback: unknown path → root index.html
      fs.readFile(path.join(root,'index.html'),(e2,b2)=>{ if(e2){res.writeHead(404);return res.end('not found');} res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(b2); });
      return;
    }
    res.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});res.end(b);
  });
}).listen(${DEV_PORT},'0.0.0.0',()=>console.log('static server up'));
`;
  await sandbox.files.write("/tmp/static-server.js", server);
  await sandbox.commands.run(
    `${NODE_PATH_PREFIX}node /tmp/static-server.js > /tmp/dev.log 2>&1`,
    { background: true },
  );
  const host = sandbox.getHost(DEV_PORT);
  const url = `https://${host}`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.status < 500) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  try {
    await sandbox.setTimeout(SERVE_EXTENSION_MS);
  } catch {
    /* older SDK / transient — initial budget usually suffices */
  }
  console.log(`[build] static server reachable: ${url}`);
  return {
    url,
    sandboxId: sandbox.sandboxId,
    repoFiles,
    close: async () => {
      await sandbox.kill().catch(() => {});
    },
  };
}

// Build the source in a sandbox and serve it on a public URL. Caller MUST call
// close() when the recording is done (also safe to call on failure paths).
export async function buildAndServe(
  sourceType: "github" | "zip",
  sourceValue: string,
  // Project owner uid. The AUTHORITATIVE zip-prefix owner assert now lives on the
  // server, which reads the prefix off the project row instead of trusting
  // anything this machine sends. This stays as the third layer of the F2 defence
  // (SQL guard → server route → here): if the server ever handed back a prefix
  // outside the owner, we refuse to write those files into the sandbox.
  ownerId?: string,
  // Required for zip sources: the server resolves the storage prefix from this.
  projectId?: string,
): Promise<BuiltApp> {
  const sandbox = await Sandbox.create("nookframe-builder", {
    timeoutMs: SANDBOX_TIMEOUT_MS,
  });
  console.log(`[build] sandbox ${sandbox.sandboxId}`);
  try {
    const repoPath = "/tmp/app";

    if (sourceType === "github") {
      // sourceValue is a reconstructed clean github URL (lib/demoSource), but
      // shell-quote at the sink too so the command can never be broken out of.
      const clone = await runSoft(
        sandbox,
        `git clone --depth 1 ${shQuote(sourceValue)} ${shQuote(repoPath)}`,
        { timeoutMs: CLONE_TIMEOUT_MS },
      );
      console.log(`[build] git clone exit ${clone.exitCode}`);
      if (clone.exitCode !== 0) {
        // Fail HERE with the real reason (audit C-G1) — before this, a bad URL /
        // private repo coasted to a vague "dev server not reachable" 90s later.
        throw new BuildFailedError(`git clone failed (exit ${clone.exitCode}): ${(clone.stderr || clone.stdout || "").slice(-300)}`);
      }
    } else {
      // zip: 서버가 서명해 준 URL로 소스 파일을 전부 받아 샌드박스에 펼친다.
      // 프리픽스 소유자 검증은 서버가 프로젝트 행에서 직접 읽어 수행한다 —
      // 이 기기가 보내는 값으로는 남의 업로드를 가리킬 수 없다.
      if (!projectId) {
        throw new BuildFailedError("zip source requires a projectId (server resolves the prefix)");
      }
      const { prefix: sourcePrefix, files } = await listSourceFiles(projectId);
      if (
        !sourcePrefix ||
        sourcePrefix.includes("..") ||
        (ownerId !== undefined && sourcePrefix.split("/")[0] !== ownerId)
      ) {
        throw new BuildFailedError(
          `zip source prefix not authorized for owner (prefix='${sourcePrefix.slice(0, 80)}')`,
        );
      }
      console.log(`[build] storage list: ${files.length} files under ${sourcePrefix}`);
      if (!files.length) {
        throw new Error(`No files found under storage prefix '${sourcePrefix}'`);
      }
      await sandbox.commands.run(`mkdir -p ${shQuote(repoPath)}`);
      for (const file of files) {
        const relative = file.path.slice(sourcePrefix.length + 1); // strip "{prefix}/"
        // zip-slip guard: a crafted upload could carry object keys like
        // `../../etc/x`. Keep every written file strictly inside repoPath.
        const segs = relative.split("/");
        if (
          !relative ||
          relative.startsWith("/") ||
          relative.includes("\\") ||
          relative.includes("\0") ||
          segs.some((s) => s === "..")
        ) {
          console.log(`[build] skipping unsafe zip path: ${relative}`);
          continue;
        }
        const data = await fetchSigned(file.url, file.path);
        const targetPath = `${repoPath}/${relative}`;
        const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
        if (targetDir && targetDir !== repoPath) {
          await sandbox.commands.run(`mkdir -p ${shQuote(targetDir)}`);
        }
        // e2b types want ArrayBuffer; a Node Buffer works at runtime (Uint8Array).
        await sandbox.files.write(targetPath, data as unknown as ArrayBuffer);
      }
      console.log(`[build] zip files expanded into sandbox`);
    }

    // Scan for the policy decision BEFORE install (node_modules would only add noise).
    const repoFiles = await collectRepoFiles(sandbox, repoPath);
    console.log(`[build] policy scan: ${Object.keys(repoFiles).length} env/config files`);

    // Phone app? Checked FIRST: an Expo package.json always carries a `start`
    // script, so the JS branch below would grab it and wait 90s for a Metro dev
    // server that never serves a web page (유형 커버리지 ②).
    const webBuild = detectWebBuild(repoFiles);
    if (webBuild) {
      console.log(`[build] cross-platform app detected: ${webBuild.kind}${webBuild.dir ? ` @ ${webBuild.dir}` : ""} → web build`);
      return webBuild.kind === "flutter"
        ? await serveFlutterWeb(sandbox, repoPath, webBuild, repoFiles)
        : await serveExpoWeb(sandbox, repoPath, webBuild, repoFiles);
    }

    // Static-vs-build decision (2026-07-19, input matrix gap #1). zip already gets
    // this on the web side via package.json, but github ALWAYS reached here and
    // ran `npm run dev` — a static-HTML repo (the most common vibe-coder upload:
    // "I pushed my Claude artifact") had no dev script and died "not reachable".
    // Buildable = package.json with a dev/start script; otherwise serve statically
    // if there's any HTML, else it isn't a web app at all.
    // Next.js's `next dev` takes no --host flag at all (only -H/--hostname) and
    // Commander errors out on unrecognized options — so the --host 0.0.0.0 below
    // (added for Vite's allowlist, see the launch command) silently kills the dev
    // server for any Next.js repo (confirmed against node_modules/next/dist/docs
    // 2026-08-14; next dev already defaults hostname to 0.0.0.0 regardless). One
    // combined check for both signals to avoid a second sandbox round-trip.
    const scriptCheck = await sandbox.commands
      .run(
        `test -f ${repoPath}/package.json && node -e "` +
          `const p=require('${repoPath}/package.json');` +
          `const s=p.scripts||{};` +
          `const d=Object.assign({},p.dependencies,p.devDependencies);` +
          `const dv=s.dev||s.start||'';` +
          `const isNext=Boolean(d.next)||/\\bnext\\b/.test(dv);` +
          `console.log((s.dev?'dev':s.start?'start':'-')+' '+(isNext?1:0));` +
          `"`,
      )
      .then((r) => {
        const [script, next] = r.stdout.trim().split(" ");
        return {
          // Which script to actually launch. Detection accepts dev OR start, so the
          // launch must run the one that exists — `npm run dev` on a start-only repo
          // (CRA's `react-scripts start` is the archetype) dies "Missing script" and
          // burned the whole install before failing (2026-08-20 audit ①).
          devScript: script === "dev" || script === "start" ? script : null,
          isNext: next === "1",
        };
      })
      .catch(() => ({ devScript: null, isNext: false }));

    if (!scriptCheck.devScript) {
      // Python web app? Checked before the static fallback — see detectPythonApp.
      const pythonApp = await detectPythonApp(sandbox, repoPath);
      if (pythonApp) {
        return await servePython(sandbox, repoPath, pythonApp, repoFiles);
      }
      // Find the shallowest index.html (root, or dist/build/public/ from a checked-in build).
      const found = await sandbox.commands.run(
        `find ${repoPath} -maxdepth 3 -name index.html -not -path '*/node_modules/*' -printf '%d %p\\n' 2>/dev/null | sort -n | head -1 | cut -d' ' -f2-`,
      );
      const indexPath = found.stdout.trim();
      if (indexPath) {
        const serveDir = indexPath.replace(/\/index\.html$/, "");
        console.log(`[build] static site (no dev script) → serving ${serveDir}`);
        return await serveStatic(sandbox, serveDir, repoFiles);
      }
      // No web face at all — if it's still runnable code, film it as a live
      // terminal instead of failing not-a-webapp (type-coverage roadmap ②).
      const term = await detectTerminalApp(sandbox, repoPath, repoFiles);
      if (term) {
        console.log(`[build] no web app → terminal demo (${term.runtime}: ${term.commands.join(", ")})`);
        return await serveTerminal(sandbox, repoPath, term, repoFiles);
      }
      // 마지막으로, 이게 "웹 타깃이 없는 네이티브 앱"인지만 확인한다. 고칠 수는
      // 없지만(브라우저에 띄울 게 없다) 어떤 플랫폼 요청이 오는지는 세야 한다 —
      // 클라우드 폰(Appetize)에 월 구독을 쓸지 판단할 유일한 근거다.
      const listed = await runSoft(
        sandbox,
        `cd ${shQuote(repoPath)} && find . -maxdepth 6 -type f -not -path './node_modules/*' ` +
          `-not -path './.git/*' | head -600`,
      );
      const native = detectNativeApp(
        listed.stdout.split("\n").map((l) => l.trim().replace(/^\.\//, "")).filter(Boolean),
      );
      if (native) console.log(`[build] native app detected (${native}) — no web target to serve`);
      throw new NotAWebappError(
        native
          ? `native ${native} app — no web target to build or serve`
          : "no dev script, no Python web app, no index.html, and no runnable CLI — nothing to serve",
        native ?? undefined,
      );
    }

    const install = await runSoft(
      sandbox,
      `${NODE_PATH_PREFIX}cd ${repoPath} && npm install --no-audit --no-fund --prefer-offline`,
      { timeoutMs: INSTALL_TIMEOUT_MS },
    );
    console.log(`[build] npm install exit ${install.exitCode}`);
    if (install.exitCode !== 0) {
      // Same principle as the clone check (audit C-G2).
      throw new BuildFailedError(`npm install failed (exit ${install.exitCode}): ${(install.stderr || install.stdout || "").slice(-300)}`);
    }

    // The public host is known before the server starts; hand it to Vite's
    // host-header allowlist escape hatch (vite ≥5.4.12/6.0.9 reject unknown Host
    // values on a dev server — the all-cloud path never saw this because it
    // recorded http://localhost:3000 from INSIDE the sandbox, but we hit the
    // public URL from outside). Harmless for non-Vite dev servers.
    const host = sandbox.getHost(DEV_PORT);
    const url = `https://${host}`;
    // --host is Vite/Astro/webpack-dev-server's convention; next dev needs -H
    // instead (see scriptCheck above) — --port is spelled the same in both.
    const hostFlag = scriptCheck.isNext ? "-H 0.0.0.0" : "--host 0.0.0.0";
    await sandbox.commands.run(
      `${NODE_PATH_PREFIX}cd ${repoPath} && ` +
        `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=${shQuote(host)} ` +
        `npm run ${scriptCheck.devScript} -- ${hostFlag} --port ${DEV_PORT} > /tmp/dev.log 2>&1`,
      { background: true },
    );

    const deadline = Date.now() + READY_TIMEOUT_MS;
    let ready = false;
    let lastNote = "";
    while (Date.now() < deadline) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const body = await res.text();
        // Vite's host-header rejection returns 403 "Blocked request. This host …" —
        // that would record as an error page, so treat it as NOT ready and surface it.
        if (/blocked request|host is not allowed/i.test(body)) {
          lastNote = "dev server rejected the public host (Vite allowedHosts)";
        } else if (res.status < 500) {
          ready = true;
          break;
        } else {
          lastNote = `status ${res.status}`;
        }
      } catch {
        lastNote = "no response yet";
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!ready) {
      const tail = await sandbox.commands.run("tail -80 /tmp/dev.log");
      throw new BuildFailedError(
        `Dev server did not become reachable within ${READY_TIMEOUT_MS / 1000}s (${lastNote}).\n--- dev.log tail ---\n${tail.stdout}`,
      );
    }
    console.log(`[build] dev server reachable: ${url}`);

    // Re-arm the sandbox lifetime now that serving starts — the initial budget
    // may be mostly spent by a long npm install.
    try {
      await sandbox.setTimeout(SERVE_EXTENSION_MS);
    } catch {
      // older SDK / transient failure: the initial 15min budget usually suffices
    }

    return {
      url,
      sandboxId: sandbox.sandboxId,
      repoFiles,
      close: async () => {
        await sandbox.kill().catch(() => {});
      },
    };
  } catch (e) {
    await sandbox.kill().catch(() => {});
    throw e;
  }
}
