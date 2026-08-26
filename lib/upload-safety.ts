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
  | "zip-no-valid"
  | "too-large"
  | "index-html-missing"
  | "bad-file-path"
  | "upload-failed"
  | "media-image-large"
  | "media-video-large"
  | "media-image-bad"
  | "media-video-bad";

export class UploadError extends Error {
  code?: UploadErrorCode;
  constructor(message: string, code?: UploadErrorCode) {
    super(message);
    this.code = code;
  }
}

// ── 제작자 미디어(Connect 요청1) — 인제스트 multipart의 screenshot/video 파트 캡.
// 대시보드 수동 업로드와 같은 노출면(thumbnail·video_url)이므로 캡도 맞춘다
// (영상 20MB=대시보드 동일, 이미지 5MB). 대시보드의 30초 길이 검사는 브라우저
// 메타데이터로만 가능해 서버 인제스트는 바이트 캡만 건다(의도된 비대칭).
export const MAX_MEDIA_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_MEDIA_VIDEO_BYTES = 20 * 1024 * 1024;

// 매직바이트 스니핑 — 확장자/Content-Type 자칭은 신뢰하지 않는다(서비스롤 업로드라
// 스토리지 RLS 우회 → 여기서 실제 미디어인지 확정하고 저장 확장자·MIME도 여기서
// 나온 값만 쓴다). 반환 null = 지원 포맷 아님.
export function sniffImage(buf: Uint8Array): { ext: string; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: "png", mime: "image/png" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { ext: "gif", mime: "image/gif" };
  }
  const ascii = (i: number, s: string) =>
    s.split("").every((ch, k) => buf[i + k] === ch.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

export function sniffVideo(buf: Uint8Array): { ext: string; mime: string } | null {
  if (buf.length < 12) return null;
  const ascii = (i: number, s: string) =>
    s.split("").every((ch, k) => buf[i + k] === ch.charCodeAt(0));
  // mp4/mov 계열: 4~7 바이트가 "ftyp".
  if (ascii(4, "ftyp")) return { ext: "mp4", mime: "video/mp4" };
  // webm(EBML 헤더 — mkv도 걸리지만 브라우저 재생 가능 범위로 수용).
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { ext: "webm", mime: "video/webm" };
  }
  return null;
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

// zip이 가리킬 "앵커 파일"을 고른다 (2026-08-20, 유형 커버리지 — zip 입구 완화).
// html = 정적 웹페이지(기존 경로: 미리보기 임베드+정적 촬영). runnable = 웹
// 얼굴은 없지만 실행 가능한 코드(package.json 또는 *.py) — E2B 빌드 모드로
// 보내면 워커의 파이썬/터미널 감지가 처리한다(local-runner/build.ts와 같은
// 신호·엔트리 랭킹을 쓰는 짝 — 목록 바꾸면 양쪽 같이). demo_url은 이 앵커
// 파일을 가리키고, .html이 아닌 앵커는 명함에서 임베드하지 않는다(영상+썸네일).
export type ZipAnchor = { path: string; kind: "html" | "runnable" };

const PY_ANCHOR_RANK = [
  "streamlit_app.py", "app.py", "main.py", "home.py", "server.py", "run.py", "cli.py", "index.py",
];

export function pickZipAnchor(entries: { relativePath: string }[]): ZipAnchor | null {
  const paths = entries.map((e) => e.relativePath);
  const depth = (p: string) => p.split("/").length;
  // Flutter는 index.html보다 먼저 본다(2026-08-26, 유형 커버리지 ②): 소스 트리에
  // 딸려오는 web/index.html은 빌드 전 껍데기라 그대로 띄우면 흰 화면이다. pubspec이
  // 있으면 E2B에서 `flutter build web`으로 진짜 앱을 만든다(local-runner/build.ts
  // detectWebBuild와 짝 — 신호 바꾸면 양쪽 같이).
  const pubspecs = paths
    .filter((p) => p.toLowerCase() === "pubspec.yaml" || p.toLowerCase().endsWith("/pubspec.yaml"))
    .sort((a, b) => depth(a) - depth(b));
  if (pubspecs.length) return { path: pubspecs[0], kind: "runnable" };
  const html = findIndexHtml(entries);
  if (html) return { path: html, kind: "html" };
  const pkgs = paths
    .filter((p) => p.toLowerCase() === "package.json" || p.toLowerCase().endsWith("/package.json"))
    .sort((a, b) => depth(a) - depth(b));
  if (pkgs.length) return { path: pkgs[0], kind: "runnable" };
  const pyScore = (p: string) => {
    const base = p.split("/").pop() ?? p;
    const rank = PY_ANCHOR_RANK.indexOf(base.toLowerCase());
    return (rank === -1 ? PY_ANCHOR_RANK.length : rank) * 100 + depth(p);
  };
  const pys = paths
    .filter((p) => p.toLowerCase().endsWith(".py"))
    .sort((a, b) => pyScore(a) - pyScore(b));
  if (pys.length) return { path: pys[0], kind: "runnable" };
  return null;
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
