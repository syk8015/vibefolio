"use client";

import { useCallback, useSyncExternalStore } from "react";

// matchMedia 구독(2026-09-15). effect 안에서 setState로 맞추면 React 컴파일러 lint
// (set-state-in-effect)에 걸리고 첫 프레임이 한 번 틀리게 그려진다 —
// useSyncExternalStore는 렌더 중에 현재 값을 바로 읽는다. 서버 렌더에선 serverValue.
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
