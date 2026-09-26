"use client";

import { useT } from "@/lib/i18n/client";

// ThemeToggle과 나란히 놓이는 34px 원형 버튼 — 스타일을 그대로 맞춘다.
// 라벨은 "누르면 바뀔 언어"를 보여준다 (ko 모드 → EN, en 모드 → 한).
export default function LanguageToggle() {
  const { locale, setLocale, t, ready } = useT();

  if (!ready) return <div style={{ width: 34, height: 34 }} />;

  return (
    <button
      onClick={() => setLocale(locale === "ko" ? "en" : "ko")}
      aria-label={t.common.switchLanguage}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: "1px solid var(--border-bright)",
        background: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: "var(--text-secondary)",
        transition: "border-color 0.2s, color 0.2s, background 0.2s",
        flexShrink: 0,
        // 13px(2026-09-27 사용자 결정 3C) — 번호 숫자가 아닌 글자는 13px 이상(글꼴 크기 규칙).
        // 11px에선 영어 화면의 '한'이 특히 뭉개졌다. 동그라미(34px)는 그대로.
        fontSize: 13,
        fontWeight: 800,
        fontFamily: "var(--font-nunito)",
        letterSpacing: "0.02em",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--blue)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--blue)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-bright)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
      }}
    >
      {locale === "ko" ? "EN" : "한"}
    </button>
  );
}
