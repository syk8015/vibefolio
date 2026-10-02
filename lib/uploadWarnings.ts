// 올린 파일 속 개인정보 경고(2026-10-02, SYNTHESIS F — 5개 세션 중 3곳이 요청).
//
// 막지 않고 알린다. 비밀 파일(.env·키)은 이름만으로 확실해서 저장하지 않지만
// (upload-safety의 secretFileKind), 이메일 주소·기기 MAC 주소·데이터 폴더는 정상 작품에도
// 흔히 있다 — 문의 메일 주소, 예시 데이터, 지도 타일. 그래서 판정은 하지 않고 "이런 게
// 같이 올라갔다"만 발행 응답에 실어, AI가 주인에게 물어보게 한다. 초안은 공개 전이라
// 주인이 검토 창에서 보고 고칠 시간이 있다.
//
// 값 자체는 돌려주지 않는다 — 경고 줄이 AI 채팅 기록에 남으니 "어느 파일에 몇 개"까지만.

export interface WarnEntry {
  relativePath: string;
  data: Uint8Array;
}

// 글자로 읽을 파일만 본다. 압축·이미지·폰트를 글자로 풀면 우연한 일치만 늘어난다.
const TEXT_EXT = /\.(html?|js|mjs|cjs|jsx|ts|tsx|json|jsonl|ndjson|csv|tsv|txt|md|ya?ml|toml|ini|cfg|conf|xml|py|rb|go|rs|java|kt|swift|php|sh|env|log|sql|vue|svelte|css)$/i;
// 라이브러리 묶음·소스맵·잠금 파일은 남이 쓴 연락처(라이선스 저자 등)가 대부분이다.
const SKIP_FILE = /(\.min\.(js|css)|\.map|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|poetry\.lock|Cargo\.lock)|(^|\/)(LICENSE|LICENCE|NOTICE|AUTHORS|CHANGELOG)[^/]*)$/i;
const SKIP_DIR = /(^|\/)(node_modules|vendor|third_party|bower_components)\//i;
const MAX_SCAN_BYTES = 1024 * 1024; // 파일 하나에서 읽는 양

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;
// 누구나 쓰는 자리표시·자동 주소는 개인정보가 아니다.
const EMAIL_IGNORE = /@(example\.(com|org|net)|test\.com|domain\.com|email\.com|yourdomain\.com|users\.noreply\.github\.com|sentry\.io|localhost)$|^(no-?reply|noreply|donotreply|user|name|you|your-?email|someone|test|foo|bar|admin|info)@/i;
// 이메일처럼 생긴 것 중 패키지 버전·이미지 해상도 표기(`logo@2x.png`, `react@18.2.0`).
const EMAIL_LOOKALIKE = /@\d+x\.|@\d+\.\d+|\.(png|jpe?g|gif|svg|webp|js|css|ts)$/i;

const MAC = /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g;
const MAC_IGNORE = /^(00[:-]){5}00$|^(ff[:-]){5}ff$|^(12[:-]34[:-]56[:-]78[:-]9a[:-]bc)$|^(aa[:-]){5}aa$/i;

// 데이터 폴더 — 표·DB·기록 파일이 모인 곳. JSON은 설정 파일이 흔해 큰 것만 센다.
const DATA_EXT = /\.(csv|tsv|jsonl|ndjson|sqlite3?|db|parquet|xlsx?|log|sql|bak|dump)$/i;
const BIG_JSON = 256 * 1024;
const DATA_FOLDER_BYTES = 2 * 1024 * 1024;
const DATA_FOLDER_FILES = 30;

export interface UploadWarnings {
  emails: { path: string; count: number }[];
  macs: { path: string; count: number }[];
  dataFolders: { folder: string; files: number; bytes: number }[];
}

function decodeHead(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(
    data.byteLength > MAX_SCAN_BYTES ? data.subarray(0, MAX_SCAN_BYTES) : data,
  );
}

export function scanUploadWarnings(entries: WarnEntry[]): UploadWarnings {
  const emails: UploadWarnings["emails"] = [];
  const macs: UploadWarnings["macs"] = [];
  const folders = new Map<string, { files: number; bytes: number }>();

  for (const e of entries) {
    const p = e.relativePath;
    if (SKIP_DIR.test(p)) continue;

    const isData = DATA_EXT.test(p) || (/\.json$/i.test(p) && e.data.byteLength >= BIG_JSON);
    if (isData) {
      // 폴더 단위로 모은다. 맨 위 파일은 "(top level)"로 — 루트에 흩어진 데이터도 잡게.
      const slash = p.lastIndexOf("/");
      const folder = slash > 0 ? p.slice(0, slash) : "(top level)";
      const f = folders.get(folder) ?? { files: 0, bytes: 0 };
      f.files += 1;
      f.bytes += e.data.byteLength;
      folders.set(folder, f);
    }

    if (!TEXT_EXT.test(p) || SKIP_FILE.test(p)) continue;
    const text = decodeHead(e.data);

    const found = new Set<string>();
    for (const m of text.matchAll(EMAIL)) {
      const addr = m[0].toLowerCase();
      if (EMAIL_IGNORE.test(addr) || EMAIL_LOOKALIKE.test(addr)) continue;
      found.add(addr);
    }
    if (found.size) emails.push({ path: p, count: found.size });

    const macFound = new Set<string>();
    for (const m of text.matchAll(MAC)) {
      if (!MAC_IGNORE.test(m[0])) macFound.add(m[0].toLowerCase().replace(/-/g, ":"));
    }
    if (macFound.size) macs.push({ path: p, count: macFound.size });
  }

  const dataFolders = [...folders.entries()]
    .filter(([, f]) => f.bytes >= DATA_FOLDER_BYTES || f.files >= DATA_FOLDER_FILES)
    .map(([folder, f]) => ({ folder, ...f }))
    .sort((a, b) => b.bytes - a.bytes);

  emails.sort((a, b) => b.count - a.count);
  macs.sort((a, b) => b.count - a.count);
  return { emails, macs, dataFolders };
}

const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)}MB`;
const list = (items: string[], max = 3) =>
  `${items.slice(0, max).join(", ")}${items.length > max ? ` (+${items.length - max} more)` : ""}`;

// 발행 응답의 `privacyWarnings` 줄. CLI·MCP 출력은 영어 고정이라 여기서 영어로 만든다.
// 마지막 줄은 할 일 — 경고만 던지면 AI가 그냥 넘어간다.
export function formatUploadWarnings(w: UploadWarnings): string[] {
  const lines: string[] = [];
  if (w.emails.length) {
    lines.push(`Email addresses found in ${w.emails.length} file(s): ${list(w.emails.map((e) => `${e.path} (${e.count})`))}.`);
  }
  if (w.macs.length) {
    lines.push(`Device MAC addresses found in ${w.macs.length} file(s): ${list(w.macs.map((e) => `${e.path} (${e.count})`))}.`);
  }
  if (w.dataFolders.length) {
    lines.push(`Data folders uploaded: ${list(w.dataFolders.map((f) => `${f.folder}/ (${f.files} files, ${mb(f.bytes)})`))}.`);
  }
  if (lines.length) {
    lines.push("Anyone can read these files once the work is public. Ask the owner whether they are meant to be shared; if not, remove them and publish this draft again (same draftId).");
  }
  return lines;
}
