// 테마 상태의 단일 출처. 데스크탑 nav의 ThemeToggle과 모바일 nav의
// MobileNavMenu가 같은 저장소 키·같은 이벤트를 써야 두 컨트롤이 어긋나지 않는다.
// (app/layout.tsx의 인라인 부트 스크립트도 같은 키를 읽는다 — FOUC 방지용이라
//  번들을 기다릴 수 없어 의도적으로 중복돼 있다.)

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "vf-theme";
export const THEME_EVENT = "vf-theme-change";

export function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored === "dark" || stored === "light") return stored;
    return getSystemTheme();
  } catch { /* SSR */ }
  return "dark";
}

// data-theme 속성만 바꾸고, 같은 화면의 다른 테마 컨트롤이 따라올 수 있게
// 이벤트를 쏜다. 저장은 하지 않는다(시스템 변경 추종 경로가 있어서).
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  // UA 캔버스·스크롤바·폼 컨트롤 톤. layout의 부트 스크립트와 같은 처리를
  // 토글 시점에도 해줘야 테마를 바꾼 뒤 새로고침 전까지 어긋나지 않는다.
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#1a1612" : "#fdfaf3");
  document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }));
}

// 사용자가 직접 고른 경우 — 적용 + 저장(시스템 추종 해제).
export function setStoredTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch { /* private mode 등 */ }
}

// 다른 테마 컨트롤이 테마를 바꿨을 때 따라오기 위한 구독.
export function onThemeChange(handler: (theme: Theme) => void): () => void {
  const listener = (e: Event) => {
    const next = (e as CustomEvent<{ theme: Theme }>).detail?.theme;
    if (next === "dark" || next === "light") handler(next);
  };
  document.addEventListener(THEME_EVENT, listener);
  return () => document.removeEventListener(THEME_EVENT, listener);
}
