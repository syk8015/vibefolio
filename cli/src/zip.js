import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import JSZip from "jszip";

// 정적 빌드 디렉터리를 zip으로. 서버측 인제스트가 다시 검증(≤25MB·index.html·zip-slip)
// 하지만, 큰 디렉터리를 통째 올려 서버에서 튕기는 걸 막으려 여기서도 크기를 캡한다.

const SKIP = new Set([
  "node_modules", ".git", ".next", ".vercel", ".turbo", ".cache",
  ".DS_Store", "Thumbs.db",
]);
const MAX_BYTES = 25 * 1024 * 1024;

export async function zipDir(dir) {
  const zip = new JSZip();
  let total = 0;

  async function walk(cur) {
    const entries = await readdir(cur, { withFileTypes: true });
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        const buf = await readFile(full);
        total += buf.length;
        if (total > MAX_BYTES) {
          throw new Error("빌드 산출물이 25MB를 초과해요 — 더 작은 정적 번들을 올려주세요.");
        }
        const rel = relative(dir, full).split(sep).join("/");
        zip.file(rel, buf);
      }
    }
  }

  await walk(dir);
  if (Object.keys(zip.files).length === 0) {
    throw new Error("올릴 파일이 없어요 — 디렉터리가 비어 있어요.");
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
