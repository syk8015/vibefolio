/** 체험 버튼이 가리키는 주소가 GitHub 저장소인가. 그렇다면 "체험하러 가기"는 거짓말이다 —
 * 누르면 앱이 아니라 코드 페이지가 열린다(화면 없는 작품: CLI·MCP 서버 등). 버튼 이름이
 * 결과를 말하게 "GitHub에서 보기"로 바꾸는 데 쓴다(docs/ui-rules.md §1-3, 10-30). */
export function isGitHubUrl(url: string | null | undefined): boolean {
  if (!url || !/^https?:\/\//i.test(url.trim())) return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === "github.com" || host === "www.github.com";
  } catch {
    return false;
  }
}
