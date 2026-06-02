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

export function isGithubRepoUrl(url: string): boolean {
  return GITHUB_REPO_RE.test(url.trim());
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
