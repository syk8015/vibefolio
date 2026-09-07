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
    name === ".git-credentials"
  );
}
const MAX_BYTES = 25 * 1024 * 1024;

export async function zipDir(dir) {
  const zip = new JSZip();
  let total = 0;

  async function walk(cur) {
    const entries = await readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP.has(e.name) || isSecretName(e.name)) continue;
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        const buf = await readFile(full);
        total += buf.length;
        if (total > MAX_BYTES) {
          throw new Error("Build output exceeds 25MB — upload a smaller static bundle.");
        }
        const rel = relative(dir, full).split(sep).join("/");
        zip.file(rel, buf);
      }
    }
  }

  await walk(dir);
  if (Object.keys(zip.files).length === 0) {
    throw new Error("Nothing to upload — the directory is empty.");
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
