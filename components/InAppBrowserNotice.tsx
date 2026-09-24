"use client";

import { useState, useSyncExternalStore } from "react";
import { isInAppBrowser } from "@/lib/traffic-source";
import { copyText } from "@/lib/clipboard";
import { useT } from "@/lib/i18n/client";

// 인스타·스레드 등 앱 안 브라우저에서 가입·로그인 화면을 열면 띄우는 한 줄 안내.
// 구글은 웹뷰 로그인을 막을 때가 있다(403 disallowed_useragent) — 다만 앱·기기마다 달라서
// 09-24 사용자 실기기 인스타에선 그냥 됐다. 그래서 "막혀요"라고 단정하지 않고 "안 되면"
// 으로 안내한다(단정하면 제일 쉬운 구글 버튼을 피하게 만든다). 웹뷰를 밖으로 여는 확실한
// 방법은 없어서 메뉴 위치를 알려 주고, 주소 복사를 폴백으로 둔다. 서버 렌더에는 없고
// UA를 본 뒤에만 나타난다.
const noopSubscribe = () => () => {};

export default function InAppBrowserNotice() {
  const { t } = useT();
  // UA는 바뀌지 않으니 구독할 것이 없다 — 서버 렌더(false)와 클라이언트 값만 가른다.
  const inApp = useSyncExternalStore(
    noopSubscribe,
    () => isInAppBrowser(navigator.userAgent),
    () => false,
  );
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");

  if (!inApp) return null;

  async function copy() {
    const ok = await copyText(location.href);
    setCopied(ok ? "ok" : "fail");
  }

  return (
    <div role="note" className="mb-6 rounded-xl px-4 py-3 text-xs leading-relaxed"
      style={{ background: "var(--blue-tint)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
      <p className="font-bold mb-1">{t.auth.inAppTitle}</p>
      <p style={{ color: "var(--text-secondary)" }}>{t.auth.inAppBody}</p>
      <button type="button" onClick={copy} className="mt-2 font-bold"
        style={{ color: "var(--blue)", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", textDecoration: "underline" }}>
        {copied === "ok" ? t.auth.inAppCopied : copied === "fail" ? t.auth.inAppCopyFailed : t.auth.inAppCopy}
      </button>
    </div>
  );
}
