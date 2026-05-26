export type DemoSourceType = "github" | "live_url" | "zip";

export interface DemoSource {
  type: DemoSourceType;
  value: string;
}

const GITHUB_REPO_RE =
  /^https?:\/\/(?:www\.)?github\.com\/[^/\s]+\/[^/\s?#]+/i;

export function isGithubRepoUrl(url: string): boolean {
  return GITHUB_REPO_RE.test(url.trim());
}

export function detectDemoSource(demoUrl: string | null | undefined): DemoSource | null {
  if (!demoUrl) return null;
  const trimmed = demoUrl.trim();
  if (!trimmed) return null;
  // 파일 업로드 결과: 우리 자체 /api/preview/<path>. 그대로 리턴해 두면
  // API 라우트가 origin을 붙여 절대 URL로 변환한 뒤 live_url로 녹화.
  if (trimmed.startsWith("/api/preview/")) {
    return { type: "live_url", value: trimmed };
  }
  if (isGithubRepoUrl(trimmed)) {
    return { type: "github", value: normalizeGithubUrl(trimmed) };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: "live_url", value: trimmed };
  }
  return null;
}

function normalizeGithubUrl(url: string): string {
  return url.replace(/\.git(?:[/?#].*)?$/i, "").replace(/\/+$/, "");
}
