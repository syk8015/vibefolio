/**
 * thum.io 스크린샷 서비스 URL. 외부에서 접근 가능한 공개 페이지여야 한다.
 * (업로드 프로젝트는 /api/preview/... 절대 URL을 넘긴다.)
 */
export function screenshotUrl(pageUrl: string): string {
  return `https://image.thum.io/get/width/1200/crop/630/${pageUrl}`;
}
