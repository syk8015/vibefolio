"use client";

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const BASE_CSS = `/* ============================================================
   Vibefolio — 명함 페이지 베이스 CSS
   아래 코드를 자유롭게 수정하세요.
   ============================================================

   사용 가능한 CSS 변수
   ────────────────────────────────────────────────────────────
   --bg              페이지 배경
   --surface         카드/패널 배경
   --border          기본 보더 색
   --border-bright   강조 보더 색
   --text-primary    본문 텍스트 (잉크)
   --text-secondary  보조 텍스트
   --text-muted      흐린 텍스트
   --blue            잉크 액센트 (브랜드 컬러)
   --blue-tint       잉크 액센트 틴트 (옅은 배경)
   --font-serif      본문 serif (Hahmlet)
   --font-nunito     UI sans
   --font-mono       모노스페이스
   ============================================================ */

/* 라이트 테마 (기본 — 종이) */
:root,
[data-theme="light"] {
  --bg: #fdfaf3;
  --surface: #ffffff;
  --border: #ece4d2;
  --border-bright: #cfc1a3;
  --blue: #1a1612;
  --blue-tint: rgba(26, 22, 18, 0.05);
  --text-primary: #1a1612;
  --text-secondary: #6a5e4e;
  --text-muted: #a89b87;
}

/* 다크 테마 (잉크) */
[data-theme="dark"] {
  --bg: #1a1612;
  --surface: #221d18;
  --border: #2e2620;
  --border-bright: #4a3e35;
  --blue: #f4ede0;
  --blue-tint: rgba(244, 237, 224, 0.05);
  --text-primary: #f4ede0;
  --text-secondary: #b8a98a;
  --text-muted: #6a5e4e;
}

/* 프로필 사진 — .vf-avatar */
.vf-avatar {
  /* 기본: 96px~128px 원형 */
}

/* 카드 호버 — 잉크 보더 */
.card-hover-glow {
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  transition: box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease;
}
.card-hover-glow:hover {
  border-color: var(--text-primary);
  box-shadow: 0 6px 18px rgba(0,0,0,0.08);
  transform: translateY(-2px);
}

/* 구분선 */
.blue-line {
  background: var(--text-primary);
  opacity: 0.25;
}

/* 말풍선 */
.speech-bubble {
  background: var(--surface);
  border: 1px solid var(--border-bright);
  border-radius: 14px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* 소셜 링크 */
.social-link {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.social-link:hover { color: var(--text-primary); }`;

interface ProfileData {
  custom_mode: boolean;
  custom_css: string;
}

export default function CustomTab({ user }: { user: User }) {
  const [css, setCss] = useState(BASE_CSS);
  const [customMode, setCustomMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const username = user.user_metadata?.username || user.email?.split("@")[0] || "";

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("custom_mode, custom_css")
        .eq("id", user.id)
        .single();
      if (data) {
        const p = data as ProfileData;
        setCustomMode(p.custom_mode ?? false);
        setCss(p.custom_css || BASE_CSS);
      }
    }
    load();
  }, [user.id]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const supabase = createClient();
    await supabase.from("profiles").update({ custom_css: css }).eq("id", user.id);
    setSaving(false);
    setSaved(true);
  }

  async function handleToggleMode() {
    if (!customMode) {
      setShowActivateModal(true);
      return;
    }
    setToggling(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ custom_mode: false }).eq("id", user.id);
    setCustomMode(false);
    setToggling(false);
  }

  async function handleActivateConfirm() {
    setShowActivateModal(false);
    setToggling(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ custom_mode: true }).eq("id", user.id);
    setCustomMode(true);
    setToggling(false);
  }

  return (
    <div className="max-w-2xl mx-auto w-full">

      {/* Mode toggle */}
      <div
        className={`flex items-center justify-between p-4 mb-6 ${customMode ? "vf-card-accent" : "vf-card"}`}
      >
        <div>
          <p
            className="vf-serif-display text-base"
            style={{ fontWeight: 500, marginBottom: "0.25rem" }}
          >
            {customMode ? "✨ 커스텀 모드 활성화됨" : "기본 모드"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {customMode
              ? <>vibefolio.com/<span className="vf-mono" style={{ color: "var(--text-secondary)" }}>{username}</span> 에 커스텀 CSS가 적용중이에요</>
              : "커스텀 모드를 켜면 아래 CSS가 명함에 반영돼요"}
          </p>
        </div>
        <button
          onClick={handleToggleMode}
          disabled={toggling}
          className={customMode ? "vf-button-ghost" : "vf-button-primary"}
          style={{ cursor: toggling ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
        >
          {toggling ? "…" : customMode ? "기본으로 되돌리기" : "커스텀 모드 켜기"}
        </button>
      </div>

      {/* CSS Editor */}
      <textarea
        value={css}
        onChange={(e) => { setCss(e.target.value); setSaved(false); }}
        spellCheck={false}
        rows={28}
        className="w-full rounded-xl p-4 text-sm leading-relaxed mb-4"
        style={{
          background: "var(--surface-soft)",
          border: "none",
          color: "var(--text-primary)",
          fontFamily: "var(--font-mono), monospace",
          resize: "vertical",
          outline: "none",
        }}
      />

      {/* Save + Preview */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleSave}
          disabled={saving}
          className="vf-button-primary"
          style={{ cursor: saving ? "not-allowed" : "pointer" }}
        >
          {saving ? "저장 중…" : "저장하기"}
        </button>
        {saved && (
          <span className="text-sm flex items-center gap-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7l3 3 6-6.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            저장됐어요
          </span>
        )}
        <a
          href={`/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-sm transition-opacity hover:opacity-70"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}
        >
          명함 미리보기 →
        </a>
      </div>

      <p className="text-xs mt-4 leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
        💡 커스텀 모드를 켜면 명함 하단에 <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>스페셜 명함 보기</strong> 버튼이 생겨요. 방문자가 직접 전환해서 볼 수 있어요.
      </p>

      {/* Activate modal */}
      {showActivateModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          style={{ background: "var(--overlay-strong)", backdropFilter: "blur(16px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowActivateModal(false); }}
        >
          <div className="vf-card-accent w-full max-w-sm p-6">
            <div className="text-3xl mb-4">✨</div>
            <h2 className="vf-serif-display mb-2" style={{ fontSize: "1.2rem", fontWeight: 500, margin: 0, marginBottom: "0.5rem" }}>
              커스텀 스타일을 적용할게요
            </h2>
            <p className="text-xs leading-relaxed mb-6" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              저장된 CSS가 명함 페이지에 반영돼요. 악성 스크립트나 외부 리소스 무단 삽입이 포함된 경우 자동으로 차단될 수 있어요.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowActivateModal(false)} className="vf-button-ghost flex-1" style={{ padding: "0.65rem 1rem" }}>
                취소
              </button>
              <button onClick={handleActivateConfirm} className="vf-button-primary flex-1" style={{ padding: "0.65rem 1rem" }}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
