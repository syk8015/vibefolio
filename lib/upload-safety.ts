// 업로드 안전 — 대시보드 브라우저 업로더와 서버측 인제스트 API가 공유한다.
// 보안 핵심인 zip-slip 가드(safeRelativePath)를 한 곳에 두어 두 경로가 갈라지지
// 않게 하는 게 목적. 브라우저/노드 전용 API를 쓰지 않아 양 번들에서 import 가능
// (jszip은 isomorphic — 아래 서버 확장기는 동적 import).

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// 압축 폭탄/과다 엔트리 방어(서버 전용 확장기에서 사용).
export const MAX_ZIP_ENTRIES = 2000;

export const MIME_TYPES: Record<string, string> = {
  html: "text/html", htm: "text/html", css: "text/css",
  js: "application/javascript", ts: "application/javascript",
  jsx: "application/javascript", tsx: "application/javascript",
  json: "application/json", svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp",
  woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf",
  ico: "image/x-icon",
};

export function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

// zip-slip 방어: 업로드 엔트리 경로는 `${userId}/${projectId}/${relativePath}`로
// storage 키가 된다. `..` 세그먼트·절대경로·역슬래시·NUL이 있으면 다른 사용자
// prefix로 새거나(traversal) 키를 오염시킬 수 있으므로 그런 엔트리는 버린다.
// (스토리지 RLS도 `..` 키를 막지만, 서비스롤 인제스트 경로는 RLS를 우회하므로
//  여기 + 최종 키 prefix assert 가 유일한 방어다.)
export function safeRelativePath(raw: string): string | null {
  const p = raw.replace(/^\/+/, ""); // 선행 슬래시 제거
  if (!p || p.startsWith("__MACOSX/")) return null;
  const segs = p.split("/");
  // `..`(traversal), 백슬래시, 그리고 모든 제어문자(\0·\t·\n·\r 포함)를 버린다.
  // raw CR/LF/TAB는 정상 파일명에 없고, fetch의 URL 정규화 단계에서 스트립되어
  // `.\n.` → `..` 처럼 prefix를 벗어나는 데 악용될 수 있다.
  // (%2e%2e 같은 인코딩 traversal은 업로드 지점의 URL-정규화 assert가 막는다.)
  if (segs.some((s) => s === ".." || s.includes("\\") || /[\x00-\x1f]/.test(s))) {
    return null;
  }
  return p;
}

/** 인제스트에서 400으로 매핑되는, 유저 노출 가능한 업로드 검증 실패.
 * message는 한국어 기본 카피, code는 인제스트 라우트가 locale별 메시지로
 * 다시 그리기 위한 판별자(없으면 message 그대로 노출). */
export type UploadErrorCode =
  | "zip-bomb"
  | "zip-read-error"
  | "zip-empty"
  | "zip-too-many"
  | "zip-no-valid";

export class UploadError extends Error {
  code?: UploadErrorCode;
  constructor(message: string, code?: UploadErrorCode) {
    super(message);
    this.code = code;
  }
}

export interface ExpandedEntry {
  relativePath: string;
  data: Uint8Array;
  contentType: string;
}

// StreamHelper(=jszip internalStream)의 우리가 쓰는 부분만.
interface JSZipStream {
  on(event: "data", cb: (chunk: Uint8Array) => void): JSZipStream;
  on(event: "error", cb: (e: unknown) => void): JSZipStream;
  on(event: "end", cb: () => void): JSZipStream;
  resume(): JSZipStream;
  pause(): JSZipStream;
}
interface JSZipEntry {
  name: string;
  dir: boolean;
  internalStream(type: "uint8array"): JSZipStream;
}

// 한 엔트리를 스트리밍 해제하되, 공유 예산(budget.remaining)을 초과하는 순간
// 중단한다. async("uint8array")로 통째 푸는 것과 달리, 25MB 압축이 GB로 부풀어도
// 예산+한 청크 이상 메모리를 먹지 않는다(zip bomb 방어).
function readEntryCapped(
  entry: JSZipEntry,
  budget: { remaining: number },
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    let done = false;
    const stream = entry.internalStream("uint8array");
    stream
      .on("data", (chunk: Uint8Array) => {
        if (done) return;
        size += chunk.length;
        if (size > budget.remaining) {
          done = true;
          stream.pause();
          reject(new UploadError("압축 해제 크기가 한도를 초과했어요 (zip bomb 의심).", "zip-bomb"));
          return;
        }
        chunks.push(chunk);
      })
      .on("error", (e: unknown) => {
        if (done) return;
        done = true;
        reject(e instanceof Error ? e : new UploadError("zip 해제 중 오류가 났어요.", "zip-read-error"));
      })
      .on("end", () => {
        if (done) return;
        done = true;
        budget.remaining -= size;
        const out = new Uint8Array(size);
        let off = 0;
        for (const c of chunks) {
          out.set(c, off);
          off += c.length;
        }
        resolve(out);
      });
    stream.resume();
  });
}

/**
 * 서버측 zip 번들 확장. materialize 전에 엔트리 수를 막고, 해제하며 누적 압축해제
 * 크기를 예산으로 캡한다. 단일 최상위 폴더가 있으면 strip해서 index.html이 루트에
 * 오게 한다(브라우저 expandUploadEntries와 동일 의미).
 */
export async function expandZipBundle(
  zipData: ArrayBuffer | Uint8Array,
  opts?: { maxEntries?: number; maxTotalBytes?: number },
): Promise<ExpandedEntry[]> {
  const maxEntries = opts?.maxEntries ?? MAX_ZIP_ENTRIES;
  const maxTotalBytes = opts?.maxTotalBytes ?? MAX_UPLOAD_BYTES;

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(zipData); // 중앙 디렉터리만 파싱, 해제는 지연.
  const fileEntries = (Object.values(zip.files) as unknown as JSZipEntry[]).filter(
    (e) => !e.dir,
  );

  if (fileEntries.length === 0) throw new UploadError("빈 zip이에요.", "zip-empty");
  if (fileEntries.length > maxEntries) {
    throw new UploadError(`파일이 너무 많아요 (최대 ${maxEntries}개).`, "zip-too-many");
  }

  const topSegments = new Set(fileEntries.map((e) => e.name.split("/")[0]));
  const stripTop =
    topSegments.size === 1 && fileEntries.every((e) => e.name.includes("/"));

  const budget = { remaining: maxTotalBytes };
  const out: ExpandedEntry[] = [];
  for (const entry of fileEntries) {
    const parts = entry.name.split("/");
    if (stripTop) parts.shift();
    const relativePath = safeRelativePath(parts.join("/"));
    if (!relativePath) continue;
    const data = await readEntryCapped(entry, budget);
    out.push({ relativePath, data, contentType: getMimeType(relativePath) });
  }
  if (out.length === 0) throw new UploadError("업로드할 유효한 파일이 없어요.", "zip-no-valid");
  return out;
}

/** 번들에서 index.html을 찾아 그 상대경로를 돌려준다(가장 얕은 것). 없으면 null. */
export function findIndexHtml(entries: { relativePath: string }[]): string | null {
  const indexes = entries
    .map((e) => e.relativePath)
    .filter((p) => p.toLowerCase().endsWith("/index.html") || p.toLowerCase() === "index.html");
  if (indexes.length === 0) return null;
  // 세그먼트 수가 가장 적은(=가장 얕은) index.html.
  return indexes.sort((a, b) => a.split("/").length - b.split("/").length)[0];
}
