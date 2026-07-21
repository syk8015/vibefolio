export type DemoSourceType = "github" | "live_url" | "zip";

export interface DemoSource {
  type: DemoSourceType;
  value: string;
}

// 이 value들은 결국 E2B 샌드박스에서 `git clone <value>` / `node recorder <value>`
// 같은 셸 명령으로 흘러간다. 따라서 (1) 끝 앵커가 반드시 있어야 하고(없으면
// 뒤에 붙은 셸 메타문자 `; | $() 백틱`이 통과), (2) 캡처 그룹은 GitHub가 실제로
// 허용하는 안전한 문자만 받아야 한다. owner/repo만 뽑아 깨끗한 URL을 새로 만들어
// 넘기므로, 입력에 무엇이 붙어 있든 셸로 새는 문자열은 만들어지지 않는다.
const GITHUB_REPO_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})(?:[/?#].*)?$/i;

const MAX_URL_LEN = 2048;
// 공백·제어문자가 섞인 URL은 (셸 인용으로 막더라도) 정상 입력이 아니므로 거른다.
// \s(공백/탭/개행) + C0 제어문자 + DEL. 하이픈 등 정상 URL 문자는 그대로 허용.
const CONTROL_OR_SPACE = new RegExp("[\\s\\x00-\\x1f\\x7f]");

// 콘텐츠 호스트: 사용자의 "작품"이 아니라 남의 플랫폼 페이지. demo_url(자동시연)에
// 잘못 넣으면 그 사이트를 그대로 녹화하게 된다 — video_url 칸으로 안내한다.
// hostname 정확 매치 또는 서브도메인(.suffix)만 — "mynotion.com" 같은 오탐 방지.
const CONTENT_HOSTS = [
  "youtube.com", "youtu.be", "vimeo.com", "loom.com",
  "notion.so", "notion.site",
  "figma.com", "docs.google.com", "drive.google.com", "sites.google.com",
  "twitter.com", "x.com", "instagram.com", "tiktok.com", "facebook.com", "linkedin.com",
  "medium.com", "substack.com",
];

// 사설/로컬 리터럴 호스트 — DNS 없이 잡히는 명백한 것만(전체 방어는 서버의
// assertSafePublicUrl가 DNS resolve로 담당). 클라 즉시 피드백용.
function isObviousPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "::1") return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

export type LiveUrlIssue =
  | { kind: "private-host"; host: string }
  | { kind: "content-host"; host: string };

// live_url로 판정된 값이 촬영 대상으로 부적절한지. null = 문제 없음.
// (우리 /api/preview 업로드 결과는 호출 전에 걸러지므로 여기 오지 않는다.)
export function liveUrlIssue(rawUrl: string): LiveUrlIssue | null {
  let host: string;
  try {
    host = new URL(rawUrl.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (isObviousPrivateHost(host)) return { kind: "private-host", host };
  const bare = host.replace(/^www\./, "");
  if (CONTENT_HOSTS.some((c) => bare === c || bare.endsWith("." + c))) {
    return { kind: "content-host", host: bare };
  }
  return null;
}

/** http/https URL이고 공백·제어문자가 없는지. live_url 녹화 대상 검증용. */
function isCleanHttpUrl(s: string): boolean {
  if (!s || s.length > MAX_URL_LEN || CONTROL_OR_SPACE.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function detectDemoSource(demoUrl: string | null | undefined): DemoSource | null {
  if (!demoUrl) return null;
  const trimmed = demoUrl.trim();
  if (!trimmed || trimmed.length > MAX_URL_LEN) return null;
  // 파일 업로드 결과: 우리 자체 /api/preview/<path>. 그대로 리턴해 두면
  // API 라우트가 origin을 붙여 절대 URL로 변환한 뒤 live_url로 녹화.
  // (이 경로 자체는 trigger-demo 라우트에서 다시 storage prefix로 검증된다.)
  if (trimmed.startsWith("/api/preview/")) {
    return { type: "live_url", value: trimmed };
  }
  const gh = trimmed.match(GITHUB_REPO_RE);
  if (gh) {
    // owner/repo만 신뢰. 뒤의 경로/쿼리/.git은 버리고 표준 clone URL을 재구성.
    const owner = gh[1];
    const repo = gh[2].replace(/\.git$/i, "");
    return { type: "github", value: `https://github.com/${owner}/${repo}` };
  }
  if (isCleanHttpUrl(trimmed)) {
    return { type: "live_url", value: trimmed };
  }
  return null;
}
