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
  if (trimmed.startsWith("/api/preview/")) return null;
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
