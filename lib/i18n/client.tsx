"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  matchLanguageTags,
  type Locale,
} from "./config";
import { getDictionary, type Dictionary } from "./dictionaries";

type LocaleContextValue = {
  locale: Locale;
  t: Dictionary;
  // 마운트 후 쿠키/브라우저 언어를 읽기 전까지 false.
  // SSR HTML은 항상 기본(ko)로 나가므로, 첫 페인트에서 언어가
  // 잠깐 바뀌는 게 거슬리는 화면은 ready로 가리면 된다.
  ready: boolean;
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readCookieLocale(): Locale | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`)
  );
  const value = match?.[1];
  return isLocale(value) ? value : null;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  // 이미 동적 렌더링인 서버 컴포넌트에서 getLocale() 값을 넘기면
  // 깜빡임 없이 시작한다. 없으면 마운트 후 클라이언트에서 감지.
  initialLocale?: Locale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(
    initialLocale ?? DEFAULT_LOCALE
  );
  const [ready, setReady] = useState(initialLocale != null);

  useEffect(() => {
    if (initialLocale == null) {
      const detected =
        readCookieLocale() ??
        matchLanguageTags(navigator.languages ?? [navigator.language]);
      if (detected) setLocaleState(detected);
      setReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      t: getDictionary(locale),
      ready,
      setLocale(next: Locale) {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        setLocaleState(next);
        // 서버 렌더 문자열(getT 사용 화면)도 새 쿠키로 다시 그리기
        router.refresh();
      },
    }),
    [locale, ready, router]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useT(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useT must be used within <LocaleProvider>");
  return ctx;
}
