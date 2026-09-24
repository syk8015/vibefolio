"use client";

import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";
import { readLastLoginMethod, withVia } from "@/lib/lastLogin";

// 로그인·가입 화면이 같이 쓰는 소셜 버튼(구글·깃허브). 둘 다 콜백으로 돌아와
// 코드 교환 → 프로필이 없으면 미들웨어가 온보딩으로 보낸다.
// 구글은 앱 안 브라우저(웹뷰)를 403 disallowed_useragent로 막는다고 알려져 있지만, 09-24
// 사용자 실기기(인스타 앱 안)에선 구글도 됐다 — 막힘은 앱·기기마다 다르다. 깃허브는 막는 정책이 없다.
// 지난번에 이 기기에서 쓴 방법엔 "지난번에 사용" 표시(lib/lastLogin — 콜백 주소의 via=).
// Supabase 대시보드 Redirect URLs에 `…/auth/callback?**`가 있어야 ?next=가 산다
// (없으면 Site URL=홈으로 떨어질 뿐).
type Provider = "google" | "github";
const noopSubscribe = () => () => {};

export default function SocialSignInButtons({
  redirectTo,
  onBeforeRedirect,
}: {
  /** 클릭 시점에 부른다 — ?next=를 location에서 읽으므로 렌더 때 계산하지 않는다. */
  redirectTo: () => string;
  onBeforeRedirect?: () => void;
}) {
  const { t } = useT();
  // 쿠키는 브라우저에서만 읽는다 — 서버 렌더엔 표시가 없고 하이드레이션 뒤에 붙는다.
  const last = useSyncExternalStore(noopSubscribe, readLastLoginMethod, () => null);

  async function signIn(provider: Provider) {
    onBeforeRedirect?.();
    await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: withVia(redirectTo(), provider) },
    });
  }

  return (
    <div className="flex flex-col gap-3 mb-6">
      <ProviderButton onClick={() => signIn("google")} icon={<GoogleIcon />} label={t.auth.googleContinue} lastUsed={last === "google"} />
      <ProviderButton onClick={() => signIn("github")} icon={<GitHubIcon />} label={t.auth.githubContinue} lastUsed={last === "github"} />
    </div>
  );
}

function ProviderButton({ onClick, icon, label, lastUsed }: {
  onClick: () => void; icon: React.ReactNode; label: string; lastUsed: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      className="relative w-full flex items-center justify-center gap-3 py-3 rounded-xl font-bold text-sm transition-opacity hover:opacity-80"
      style={{ border: "1px solid var(--border-bright)", background: "var(--surface)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
      {icon}
      {label}
      {/* 테두리 위 모서리에 걸친다 — 버튼 안 오른쪽에 두면 폭 360px 이하 폰에서 글자와 겹쳤다(09-24 측정). */}
      {lastUsed && (
        <span className="absolute right-3 top-0 -translate-y-1/2"><LastUsedTag onBorder /></span>
      )}
    </button>
  );
}

/** "지난번에 사용" 알약 — 소셜 버튼 테두리 위(onBorder), 로그인 화면의 메일 코드 링크·이메일 칸 옆.
 *  onBorder는 테두리 선을 가려야 해서 불투명 바탕(--bg)+테두리, 나머지는 옅은 바탕(--blue-tint는 반투명). */
export function LastUsedTag({ onBorder = false }: { onBorder?: boolean }) {
  const { t } = useT();
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold leading-none whitespace-nowrap"
      style={{
        background: onBorder ? "var(--bg)" : "var(--blue-tint)",
        border: onBorder ? "1px solid var(--border-bright)" : undefined,
        color: "var(--text-secondary)", fontFamily: "var(--font-nunito)",
      }}>
      {t.auth.lastUsed}
    </span>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// 깃허브 마크는 단색 — currentColor라 다크모드에서 저절로 뒤집힌다.
function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}
