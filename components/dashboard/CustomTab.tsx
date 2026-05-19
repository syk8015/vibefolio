"use client";

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const BASE_CSS = `/* ============================================================
   Vibefolio — 명함 페이지 베이스 CSS
   아래 코드를 자유롭게 수정하세요.
   변수 하나만 바꿔도 전체 색상이 바뀝니다.
   ============================================================ */

/* 다크 테마 (기본) */
:root,
[data-theme="dark"] {
  --bg: #08090f;
  --surface: #0d1117;
  --border: #1c2a3a;
  --border-bright: #2a3f5a;

  /* 포인트 색상 — 이것만 바꿔도 전체 무드가 달라져요 */
  --blue: #4d9eff;
  --blue-bright: #74b6ff;
  --blue-dim: #1d4ed8;
  --blue-glow: rgba(77, 158, 255, 0.22);
  --blue-tint: rgba(77, 158, 255, 0.07);

  --text-primary: #ffffff;
  --text-secondary: #5a7a9a;
  --text-muted: #2a3f5a;
  --dot-color: rgba(77, 158, 255, 0.06);
  --nav-bg: rgba(8, 9, 15, 0.85);
}

/* 라이트 테마 */
[data-theme="light"] {
  --bg: #f4f7ff;
  --surface: #ffffff;
  --border: #dae1f0;
  --border-bright: #c0cce4;
  --blue: #2d6fd4;
  --blue-bright: #1a56b8;
  --blue-dim: #1a56b8;
  --blue-glow: rgba(45, 111, 212, 0.15);
  --blue-tint: rgba(45, 111, 212, 0.07);
  --text-primary: #080c18;
  --text-secondary: #6272a0;
  --text-muted: #b0bcd8;
  --dot-color: rgba(45, 111, 212, 0.07);
  --nav-bg: rgba(244, 247, 255, 0.88);
}

/* 배경 도트 패턴 */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(circle, var(--dot-color) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
  z-index: 0;
}

/* 프로필 사진 — .vf-avatar */
.vf-avatar {
  /* 기본: 96px~128px 원형 */
}

/* 카드 호버 글로우 */
.card-hover-glow {
  border-radius: 16px;
  box-shadow: 0 0 0 1px var(--border), 0 4px 24px rgba(0,0,0,0.1);
  transition: box-shadow 0.25s ease, transform 0.25s ease;
}
.card-hover-glow:hover {
  box-shadow: 0 0 0 1px var(--blue), 0 0 28px var(--blue-glow), 0 8px 32px rgba(0,0,0,0.15);
  transform: translateY(-3px);
}

/* 구분선 그라데이션 */
.blue-line {
  background: linear-gradient(90deg, transparent, var(--blue), transparent);
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
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.social-link:hover { color: var(--blue); }`;

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
        className="flex items-center justify-between p-4 rounded-2xl mb-6"
        style={{
          border: `1px solid ${customMode ? "#f59e0b55" : "var(--border)"}`,
          background: customMode ? "rgba(245,158,11,0.05)" : "var(--surface)",
        }}
      >
        <div>
          <p className="text-sm font-black" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            {customMode ? "✨ 커스텀 모드 활성화됨" : "기본 모드"}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {customMode
              ? `vibefolio.com/${username} 에 커스텀 CSS가 적용중이에요`
              : "커스텀 모드를 켜면 아래 CSS가 명함에 반영돼요"}
          </p>
        </div>
        <button
          onClick={handleToggleMode}
          disabled={toggling}
          className="px-4 py-2 rounded-xl text-sm font-black transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{
            background: customMode ? "rgba(239,68,68,0.1)" : "#f59e0b",
            color: customMode ? "#ef4444" : "#000",
            border: customMode ? "1px solid rgba(239,68,68,0.3)" : "none",
            fontFamily: "var(--font-nunito)",
            cursor: toggling ? "not-allowed" : "pointer",
          }}
        >
          {toggling ? "..." : customMode ? "기본으로 되돌리기" : "커스텀 모드 켜기"}
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
          background: "#0d1117",
          border: "1px solid var(--border-bright)",
          color: "#e6edf3",
          fontFamily: "'Courier New', 'Monaco', monospace",
          resize: "vertical",
          outline: "none",
        }}
      />

      {/* Save + Preview */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-black transition-opacity hover:opacity-85 disabled:opacity-50"
          style={{
            background: "var(--blue)", color: "var(--bg)",
            fontFamily: "var(--font-nunito)", border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: "0 0 16px var(--blue-glow)",
          }}
        >
          {saving ? "저장 중..." : "저장하기"}
        </button>
        {saved && (
          <span className="text-sm font-bold" style={{ color: "var(--blue)", fontFamily: "var(--font-nunito)" }}>
            ✓ 저장됐어요
          </span>
        )}
        <a
          href={`/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-sm font-bold transition-opacity hover:opacity-70"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", textDecoration: "none" }}
        >
          명함 미리보기 →
        </a>
      </div>

      <p className="text-xs mt-4 leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
        💡 커스텀 모드를 켜면 명함 하단에 <strong style={{ color: "var(--text-secondary)" }}>스페셜 명함 보기</strong> 버튼이 생겨요. 방문자가 직접 전환해서 볼 수 있어요.
      </p>

      {/* Activate modal */}
      {showActivateModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowActivateModal(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "var(--surface)", border: "1px solid #f59e0b55" }}
          >
            <div className="text-3xl mb-4">✨</div>
            <h2 className="text-lg font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
              커스텀 스타일을 적용할게요
            </h2>
            <p className="text-xs leading-relaxed mb-6" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              저장된 CSS가 명함 페이지에 반영돼요. 악성 스크립트나 외부 리소스 무단 삽입이 포함된 경우 자동으로 차단될 수 있어요.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowActivateModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ border: "1px solid var(--border-bright)", color: "var(--text-secondary)", background: "none", fontFamily: "var(--font-nunito)", cursor: "pointer" }}>
                취소
              </button>
              <button onClick={handleActivateConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-black"
                style={{ background: "#f59e0b", color: "#000", fontFamily: "var(--font-nunito)", border: "none", cursor: "pointer" }}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
