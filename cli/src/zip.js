import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import JSZip from "jszip";

// 정적 빌드 디렉터리를 zip으로. 서버측 인제스트가 다시 검증(≤25MB·index.html·zip-slip)
// 하지만, 큰 디렉터리를 통째 올려 서버에서 튕기는 걸 막으려 여기서도 크기를 캡한다.

const SKIP = new Set([
  "node_modules", ".git", ".next", ".vercel", ".turbo", ".cache",
  ".DS_Store", "Thumbs.db",
  ".ssh", ".aws", ".gnupg", ".netrc", ".npmrc",
]);
// `project-files`는 공개 버킷이고 데모 URL이 {uid}/{projectId}를 노출하므로,
// `nookframe publish --dir .`로 레포 루트를 통째 올릴 때 비밀 파일이 섞여 들어가면
// 누구나 /api/preview/{uid}/{pid}/.env 로 읽을 수 있다. 이름 기반으로 차단한다.
// (정확 이름은 SKIP, 패턴은 아래 predicate — .well-known 같은 정상 dotfile은 통과)
function isSecretName(name) {
  return (
    /^\.env(\.|$)/i.test(name) ||        // .env, .env.local, .env.production ...
    /\.(pem|key|p12|pfx|keystore)$/i.test(name) ||
    /^id_(rsa|ecdsa|ed25519)(\.|$)/i.test(name) ||
    name === ".git-credentials" ||
    // 손으로 이름 붙인 비밀 파일: `tokens.secret.txt`, ESPHome `secrets.yaml` (서버 규칙과 같은 모양)
    /\.secrets?(\.[^.]+)?$/i.test(name) ||
    /^secrets?\.(ya?ml|json|toml|ini|cfg|conf|txt|env)$/i.test(name)
  );
}
const MAX_BYTES = 25 * 1024 * 1024;

// .gitignore 존중(2026-10-02, SYNTHESIS F). 레포 루트를 통째 올리면(`--dir .`) 주인이 이미
// "공유하지 않는다"고 적어 둔 것 — 개인 데이터·로그·로컬 설정 — 까지 공개 버킷에 올라갔다.
// 올리는 폴더 **안쪽**의 .gitignore만 읽는다: 레포 루트의 .gitignore는 보통 빌드 폴더(dist/)
// 자체를 적어 두므로, 그 위의 것까지 따르면 `--dir dist`가 통째로 빈다.
// 지원: 주석·빈 줄, `!` 되살리기, 끝 `/`(폴더만), 앞·중간 `/`(그 .gitignore 기준 고정),
// `*`·`?`·`**`·`[...]`. 하위 폴더의 .gitignore는 그 폴더 아래에만 걸린다. 마지막에 맞은 줄이 이긴다.
function globToRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i += 1; }
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "[") {
      const end = glob.indexOf("]", i + 1);
      if (end === -1) { re += "\\["; continue; }
      re += `[${glob.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
      i = end;
    } else if (c === "\\" && i + 1 < glob.length) { re += `\\${glob[++i]}`; }
    else re += /[.+^${}()|]/.test(c) ? `\\${c}` : c;
  }
  return re;
}

export function parseGitignore(text, base = "") {
  const rules = [];
  const prefix = base ? `${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/` : "";
  for (const raw of text.split(/\r?\n/)) {
    let p = raw.replace(/(?<!\\)\s+$/, "");
    if (!p || p.startsWith("#")) continue;
    const neg = p.startsWith("!");
    if (neg) p = p.slice(1);
    if (p.startsWith("\\#") || p.startsWith("\\!")) p = p.slice(1);
    const dirOnly = p.endsWith("/");
    if (dirOnly) p = p.slice(0, -1);
    if (!p) continue;
    const anchored = p.includes("/");
    if (p.startsWith("/")) p = p.slice(1);
    const body = globToRegex(p);
    rules.push({ neg, dirOnly, re: new RegExp(anchored ? `^${prefix}${body}$` : `^${prefix}(?:.*/)?${body}$`) });
  }
  return rules;
}

export function isIgnored(rules, rel, isDir) {
  let ignored = false;
  for (const r of rules) {
    if (r.dirOnly && !isDir) continue;
    if (r.re.test(rel)) ignored = !r.neg;
  }
  return ignored;
}

// 반환: zip 버퍼 + .gitignore 때문에 뺀 항목 수. 출력은 호출부가 한다 — 이 함수는 stdio MCP
// 서버 안에서도 돌고, 그때 stdout은 프로토콜 통로라 여기서 console.log를 하면 안 된다.
export async function zipDirWithInfo(dir) {
  const zip = new JSZip();
  let total = 0;
  let gitignored = 0;

  async function walk(cur, inherited) {
    const rel0 = relative(dir, cur).split(sep).join("/");
    let rules = inherited;
    try {
      rules = [...inherited, ...parseGitignore(await readFile(join(cur, ".gitignore"), "utf8"), rel0)];
    } catch {
      // .gitignore 없음
    }
    const entries = await readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP.has(e.name) || isSecretName(e.name)) continue;
      const full = join(cur, e.name);
      const rel = relative(dir, full).split(sep).join("/");
      if (isIgnored(rules, rel, e.isDirectory())) {
        gitignored++;
        continue;
      }
      if (e.isDirectory()) {
        await walk(full, rules);
      } else if (e.isFile()) {
        const buf = await readFile(full);
        total += buf.length;
        if (total > MAX_BYTES) {
          throw new Error("Build output exceeds 25MB — upload a smaller static bundle.");
        }
        zip.file(rel, buf);
      }
    }
  }

  await walk(dir, []);
  if (Object.keys(zip.files).length === 0) {
    throw new Error(gitignored
      ? "Nothing to upload — every file in the directory is listed in its .gitignore."
      : "Nothing to upload — the directory is empty.");
  }
  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), gitignored };
}

export async function zipDir(dir) {
  return (await zipDirWithInfo(dir)).buffer;
}
