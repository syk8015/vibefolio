// E2B build/serve — the cloud half of the M2 split (plan §3): untrusted user code
// (github clone / zip upload) is installed and dev-served ONLY inside an E2B
// sandbox; the local M5 worker receives nothing but the sandbox's public URL and
// records it with a real GPU. Ported from src/trigger/build-and-record.ts (which
// stays untouched — it is the still-deployed all-cloud path), minus the recording:
// the sandbox here builds and serves, nothing else.
//
// New for M2: while the source sits expanded in the sandbox we collect its
// env/schema/config files so safety.ts's decidePolicy() can pick read-only vs
// full interaction (plan §4.5 — remote DB detected → read-only, verified-local
// only → full, ambiguous → read-only).
// NOTE: named import — under real ESM (tsx) the package's default export is the
// module namespace object, not the Sandbox class (the cloud task's `import
// Sandbox from "e2b"` only works because Trigger.dev bundles it as CJS interop).
import { Sandbox } from "e2b";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_BUCKET } from "./config";
import { BuildFailedError, NotAWebappError } from "./errors";

// Single-quote a value so it is always exactly ONE shell argument, regardless of
// metacharacters (same sink-hardening as the cloud task: a repo URL like
// `https://x/$(curl evil)` must never run inside the sandbox shell).
function shQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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

export type BuiltApp = {
  url: string; // public https URL of the sandbox dev server
  sandboxId: string;
  repoFiles: Record<string, string>; // env/schema/config contents for decidePolicy
  close: () => Promise<void>;
};

function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (.env.local)");
  }
  return createClient(url, key);
}

// supabase storage list는 한 단계만 본다. zip 업로드는 중첩 디렉터리(src/,
// public/, ...)를 가질 수 있어서 BFS로 모든 파일 경로를 모은다.
async function listStorageFilesRecursive(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [prefix];
  while (queue.length) {
    const dir = queue.shift()!;
    const { data, error } = await supabase.storage.from(bucket).list(dir, { limit: 1000 });
    if (error) throw new Error(`storage list failed at ${dir}: ${error.message}`);
    for (const entry of data ?? []) {
      const full = `${dir}/${entry.name}`;
      // supabase는 디렉터리 placeholder를 id=null로 돌려준다.
      if (entry.id === null) queue.push(full);
      else out.push(full);
    }
  }
  return out;
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
      const clone = await sandbox.commands.run(
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
      // zip: supabase storage prefix 아래 모든 파일을 받아 샌드박스에 펼친다.
      const supabase = serviceClient();
      const filePaths = await listStorageFilesRecursive(supabase, DEMO_BUCKET, sourceValue);
      console.log(`[build] storage list: ${filePaths.length} files under ${sourceValue}`);
      if (!filePaths.length) {
        throw new Error(`No files found under storage prefix '${sourceValue}'`);
      }
      await sandbox.commands.run(`mkdir -p ${shQuote(repoPath)}`);
      for (const storagePath of filePaths) {
        const relative = storagePath.slice(sourceValue.length + 1); // strip "{prefix}/"
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
        const { data, error } = await supabase.storage.from(DEMO_BUCKET).download(storagePath);
        if (error || !data) {
          throw new Error(`storage download failed at ${storagePath}: ${error?.message ?? "no data"}`);
        }
        const targetPath = `${repoPath}/${relative}`;
        const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
        if (targetDir && targetDir !== repoPath) {
          await sandbox.commands.run(`mkdir -p ${shQuote(targetDir)}`);
        }
        await sandbox.files.write(targetPath, data);
      }
      console.log(`[build] zip files expanded into sandbox`);
    }

    // Scan for the policy decision BEFORE install (node_modules would only add noise).
    const repoFiles = await collectRepoFiles(sandbox, repoPath);
    console.log(`[build] policy scan: ${Object.keys(repoFiles).length} env/config files`);

    // Static-vs-build decision (2026-07-19, input matrix gap #1). zip already gets
    // this on the web side via package.json, but github ALWAYS reached here and
    // ran `npm run dev` — a static-HTML repo (the most common vibe-coder upload:
    // "I pushed my Claude artifact") had no dev script and died "not reachable".
    // Buildable = package.json with a dev/start script; otherwise serve statically
    // if there's any HTML, else it isn't a web app at all.
    const hasDevScript = await sandbox.commands
      .run(`test -f ${repoPath}/package.json && node -e "const s=require('${repoPath}/package.json').scripts||{};process.exit(s.dev||s.start?0:1)"`)
      .then((r) => r.exitCode === 0)
      .catch(() => false);

    if (!hasDevScript) {
      // Find the shallowest index.html (root, or dist/build/public/ from a checked-in build).
      const found = await sandbox.commands.run(
        `find ${repoPath} -maxdepth 3 -name index.html -not -path '*/node_modules/*' -printf '%d %p\\n' 2>/dev/null | sort -n | head -1 | cut -d' ' -f2-`,
      );
      const indexPath = found.stdout.trim();
      if (!indexPath) {
        throw new NotAWebappError("no dev script and no index.html — nothing to serve");
      }
      const serveDir = indexPath.replace(/\/index\.html$/, "");
      console.log(`[build] static site (no dev script) → serving ${serveDir}`);
      return await serveStatic(sandbox, serveDir, repoFiles);
    }

    const install = await sandbox.commands.run(
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
    await sandbox.commands.run(
      `${NODE_PATH_PREFIX}cd ${repoPath} && ` +
        `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=${shQuote(host)} ` +
        `npm run dev -- --host 0.0.0.0 --port ${DEV_PORT} > /tmp/dev.log 2>&1`,
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
