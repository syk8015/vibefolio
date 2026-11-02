/**
 * thum.io 스크린샷 서비스 URL. 외부에서 접근 가능한 공개 페이지여야 한다.
 * (업로드 프로젝트는 /api/preview/... 절대 URL을 넘긴다.)
 */
export function screenshotUrl(pageUrl: string): string {
  return `https://image.thum.io/get/width/1200/crop/630/${pageUrl}`;
}

const SHOT_PREFIX = screenshotUrl("");

/**
 * 공개하는 순간의 자동 썸네일(2026-11-02, 초안 비공개). 초안 폴더는 주인 열쇠로만 열리므로 thum.io는
 * 공개 뒤에만 찍을 수 있다. 업로드한 웹 화면(`/api/preview/….html`)이고, 썸네일이 없거나 예전에 찍은
 * thum.io 자동 썸네일일 때만 새로 만든다 — 제작자가 준 그림(_media/·직접 올림)은 건드리지 않는다.
 * 주소 끝의 `?v=`는 thum.io가 초안 때 찍어 둔 404 그림을 다시 쓰지 않게 하는 표식이다.
 * 바꿀 게 없으면 null.
 */
export function publishThumbnail(demoUrl: string | null | undefined, current: string | null | undefined, origin: string, nowMs = Date.now()): string | null {
  if (!demoUrl || !/^\/api\/preview\/[^?#]+\.html?$/i.test(demoUrl)) return null;
  if (current && !(current.startsWith(SHOT_PREFIX) && current.includes("/api/preview/"))) return null;
  return screenshotUrl(`${origin}${demoUrl}?v=${nowMs.toString(36)}`);
}
