"use client";

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// --- Preset themes ---
interface Theme {
  id: string;
  label: string;
  preview: { bg: string; surface: string; accent: string };
  css: string;
}

const PRESET_THEMES: Theme[] = [
  {
    id: "default",
    label: "기본 (Vibefolio)",
    preview: { bg: "#08090a", surface: "#111318", accent: "#4d9eff" },
    css: "",
  },
  {
    id: "pink",
    label: "핑크 드림",
    preview: { bg: "#0d0a10", surface: "#18101a", accent: "#f472b6" },
    css: `:root {
  --blue: #f472b6 !important;
  --blue-bright: #fb7bb0 !important;
  --blue-glow: rgba(244,114,182,0.3) !important;
  --blue-tint: rgba(244,114,182,0.08) !important;
  --border-bright: rgba(244,114,182,0.25) !important;
}`,
  },
  {
    id: "cyberpunk",
    label: "사이버펑크",
    preview: { bg: "#0a0014", surface: "#130020", accent: "#00ff87" },
    css: `:root {
  --bg: #0a0014 !important;
  --surface: #130020 !important;
  --nav-bg: rgba(10,0,20,0.85) !important;
  --blue: #00ff87 !important;
  --blue-bright: #39ffb0 !important;
  --blue-glow: rgba(0,255,135,0.3) !important;
  --blue-tint: rgba(0,255,135,0.08) !important;
  --border: rgba(0,255,135,0.1) !important;
  --border-bright: rgba(0,255,135,0.25) !important;
}`,
  },
  {
    id: "sunset",
    label: "선셋",
    preview: { bg: "#0c0804", surface: "#18100a", accent: "#f97316" },
    css: `:root {
  --bg: #0c0804 !important;
  --surface: #18100a !important;
  --blue: #f97316 !important;
  --blue-bright: #fb923c !important;
  --blue-glow: rgba(249,115,22,0.3) !important;
  --blue-tint: rgba(249,115,22,0.08) !important;
  --border-bright: rgba(249,115,22,0.25) !important;
}`,
  },
  {
    id: "aurora",
    label: "오로라",
    preview: { bg: "#040f0a", surface: "#091a0f", accent: "#10b981" },
    css: `:root {
  --bg: #040f0a !important;
  --surface: #091a0f !important;
  --blue: #10b981 !important;
  --blue-bright: #34d399 !important;
  --blue-glow: rgba(16,185,129,0.3) !important;
  --blue-tint: rgba(16,185,129,0.08) !important;
  --border-bright: rgba(16,185,129,0.25) !important;
}`,
  },
  {
    id: "minimal",
    label: "미니멀 화이트",
    preview: { bg: "#ffffff", surface: "#f5f5f5", accent: "#111111" },
    css: `:root {
  --bg: #ffffff !important;
  --surface: #f5f5f5 !important;
  --nav-bg: rgba(255,255,255,0.9) !important;
  --text-primary: #111111 !important;
  --text-secondary: #444444 !important;
  --text-muted: #888888 !important;
  --border: rgba(0,0,0,0.08) !important;
  --border-bright: rgba(0,0,0,0.15) !important;
  --blue: #111111 !important;
  --blue-bright: #333333 !important;
  --blue-glow: rgba(0,0,0,0.12) !important;
  --blue-tint: rgba(0,0,0,0.04) !important;
}`,
  },
];

// Hex → rgba helper
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function accentCss(hex: string): string {
  // Lighten by mixing with white for "bright"
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const bright = `#${Math.min(255, r + 40).toString(16).padStart(2, "0")}${Math.min(255, g + 40).toString(16).padStart(2, "0")}${Math.min(255, b + 40).toString(16).padStart(2, "0")}`;
  return `:root {
  --blue: ${hex} !important;
  --blue-bright: ${bright} !important;
  --blue-glow: ${hexToRgba(hex, 0.3)} !important;
  --blue-tint: ${hexToRgba(hex, 0.08)} !important;
  --border-bright: ${hexToRgba(hex, 0.25)} !important;
}`;
}

const EXTRA_SNIPPETS = [
  {
    label: "프로필 사진 크게",
    code: `.vf-avatar { width: 160px !important; height: 160px !important; font-size: 4rem !important; }`,
  },
  {
    label: "프로필 사진 호버 효과",
    code: `.vf-avatar { transition: transform 0.3s ease !important; }\n.vf-avatar:hover { transform: scale(1.08) rotate(2deg) !important; }`,
  },
  {
    label: "섹션 페이드인",
    code: `@keyframes vf-fadeup {\n  from { opacity: 0; transform: translateY(24px); }\n  to { opacity: 1; transform: translateY(0); }\n}\nsection { animation: vf-fadeup 0.7s ease both; }`,
  },
  {
    label: "배경 그라데이션",
    code: `body {\n  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e) !important;\n  background-attachment: fixed !important;\n}`,
  },
];

interface ProfileData {
  custom_mode: boolean;
  custom_css: string;
}

export default function CustomTab({ user }: { user: User }) {
  const [css, setCss] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<string>("default");
  const [accentColor, setAccentColor] = useState("#4d9eff");
  const [showEditor, setShowEditor] = useState(false);
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
        setCss(p.custom_css ?? "");
        // Try to detect which preset is active
        if (!p.custom_css) setSelectedTheme("default");
      }
    }
    load();
  }, [user.id]);

  function applyTheme(theme: Theme) {
    setSelectedTheme(theme.id);
    setCss(theme.css);
    setSaved(false);
  }

  function applyAccentColor(hex: string) {
    setAccentColor(hex);
    setSelectedTheme("custom");
    setCss(accentCss(hex));
    setSaved(false);
  }

  function insertSnippet(code: string) {
    setCss((prev) => (prev ? `${prev}\n\n${code}` : code));
    setSelectedTheme("custom");
    setSaved(false);
  }

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
        className="flex items-center justify-between p-4 rounded-2xl mb-8"
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
              ? `vibefolio.com/${username} 에 커스텀 스타일이 적용중이에요`
              : "커스텀 모드를 켜면 선택한 스타일이 명함에 반영돼요"}
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

      {/* Preset Themes */}
      <section className="mb-8">
        <p className="text-xs font-bold mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
          테마 선택
        </p>
        <div className="grid grid-cols-3 gap-3">
          {PRESET_THEMES.map((theme) => {
            const isActive = selectedTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => applyTheme(theme)}
                className="relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-150"
                style={{
                  background: isActive ? "var(--blue-tint)" : "var(--surface)",
                  border: `1.5px solid ${isActive ? "var(--blue)" : "var(--border)"}`,
                  cursor: "pointer",
                  boxShadow: isActive ? "0 0 12px var(--blue-glow)" : "none",
                }}
              >
                {/* Mini preview */}
                <div className="w-full h-14 rounded-lg overflow-hidden relative"
                  style={{ background: theme.preview.bg }}>
                  {/* Simulated nav bar */}
                  <div className="absolute top-1.5 left-2 right-2 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: theme.preview.accent, boxShadow: `0 0 4px ${theme.preview.accent}` }} />
                    <div className="h-1 rounded-full flex-1" style={{ background: theme.preview.surface }} />
                  </div>
                  {/* Simulated avatar + name */}
                  <div className="absolute top-5 left-0 right-0 flex flex-col items-center gap-1">
                    <div className="w-4 h-4 rounded-full" style={{ background: theme.preview.accent, opacity: 0.9 }} />
                    <div className="h-1 w-8 rounded-full" style={{ background: theme.preview.accent, opacity: 0.5 }} />
                    <div className="h-0.5 w-5 rounded-full" style={{ background: theme.preview.surface }} />
                  </div>
                </div>
                <span className="text-xs font-bold" style={{
                  color: isActive ? "var(--blue)" : "var(--text-secondary)",
                  fontFamily: "var(--font-nunito)"
                }}>
                  {theme.label}
                </span>
                {isActive && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: "var(--blue)" }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4l1.5 1.5 3.5-3" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Accent Color Picker */}
      <section className="mb-8 p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-bold mb-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
          포인트 색상
        </p>
        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="color"
              value={accentColor}
              onChange={(e) => applyAccentColor(e.target.value)}
              className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0.5"
              style={{ background: "var(--bg)", border: "1.5px solid var(--border-bright)" }}
            />
          </div>
          {/* Preset accent swatches */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              "#4d9eff", "#f472b6", "#f97316", "#10b981",
              "#a855f7", "#06b6d4", "#eab308", "#ef4444",
            ].map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyAccentColor(color)}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                style={{
                  background: color,
                  border: accentColor === color && selectedTheme === "custom" ? "2px solid #fff" : "2px solid transparent",
                  cursor: "pointer",
                  boxShadow: `0 0 6px ${color}55`,
                }}
              />
            ))}
          </div>
          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
            {accentColor}
          </span>
        </div>
      </section>

      {/* Extra Snippets */}
      <section className="mb-6">
        <p className="text-xs font-bold mb-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
          추가 효과
        </p>
        <div className="flex flex-wrap gap-2">
          {EXTRA_SNIPPETS.map((s) => (
            <button
              key={s.label}
              onClick={() => insertSnippet(s.code)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-70"
              style={{
                border: "1px solid var(--border-bright)",
                color: "var(--text-secondary)",
                background: "var(--surface)",
                fontFamily: "var(--font-nunito)",
                cursor: "pointer",
              }}
            >
              + {s.label}
            </button>
          ))}
        </div>
      </section>

      {/* CSS Editor (collapsible) */}
      <section className="mb-6">
        <button
          type="button"
          onClick={() => setShowEditor((v) => !v)}
          className="flex items-center gap-2 text-xs font-bold mb-2 transition-opacity hover:opacity-70"
          style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ transform: showEditor ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          코드로 직접 편집
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(고급)</span>
        </button>
        {showEditor && (
          <textarea
            value={css}
            onChange={(e) => { setCss(e.target.value); setSelectedTheme("custom"); setSaved(false); }}
            placeholder={`/* 여기에 CSS를 직접 입력하세요 */\n\n:root {\n  --blue: #4d9eff !important;\n}`}
            rows={14}
            spellCheck={false}
            className="w-full rounded-xl p-4 text-sm leading-relaxed"
            style={{
              background: "#0d1117",
              border: "1px solid var(--border-bright)",
              color: "#e6edf3",
              fontFamily: "'Courier New', 'Monaco', monospace",
              resize: "vertical",
              outline: "none",
            }}
          />
        )}
      </section>

      {/* Save + Preview */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-black transition-opacity hover:opacity-85 disabled:opacity-50"
          style={{
            background: "var(--blue)", color: "#fff",
            fontFamily: "var(--font-nunito)", border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: "0 0 16px var(--blue-glow)"
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
        💡 커스텀 모드를 켜면 명함 하단에 <strong>스페셜 명함 보기</strong> 버튼이 생겨요.
        방문자가 직접 전환해서 볼 수 있어요.
      </p>

      {/* Activate confirmation modal */}
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
            <p className="text-sm leading-relaxed mb-1" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              저장된 CSS가 명함 페이지에 반영돼요.
            </p>
            <p className="text-xs leading-relaxed mb-6" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              악성 스크립트, 외부 리소스 무단 삽입, 유해 콘텐츠가 포함된 CSS는 자동으로 차단될 수 있어요.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowActivateModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ border: "1px solid var(--border-bright)", color: "var(--text-secondary)", background: "none", fontFamily: "var(--font-nunito)", cursor: "pointer" }}
              >
                취소
              </button>
              <button
                onClick={handleActivateConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-black"
                style={{ background: "#f59e0b", color: "#000", fontFamily: "var(--font-nunito)", border: "none", cursor: "pointer" }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
