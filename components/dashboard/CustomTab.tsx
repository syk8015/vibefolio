"use client";

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const SNIPPETS = [
  {
    label: "배경색 변경",
    code: `/* 배경색 */\n:root {\n  --bg: #0d1117 !important;\n  --surface: #161b22 !important;\n  --nav-bg: rgba(13,17,23,0.85) !important;\n}`,
  },
  {
    label: "포인트 색 변경",
    code: `/* 포인트 색 (핑크 예시) */\n:root {\n  --blue: #f472b6 !important;\n  --blue-bright: #fb7bb0 !important;\n  --blue-glow: rgba(244,114,182,0.3) !important;\n  --blue-tint: rgba(244,114,182,0.08) !important;\n}`,
  },
  {
    label: "폰트 변경",
    code: `/* Space Grotesk 폰트 */\n@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');\n\n* { font-family: 'Space Grotesk', sans-serif !important; }`,
  },
  {
    label: "프로필 사진 크게",
    code: `/* 프로필 사진 크기 */\n.vf-avatar {\n  width: 160px !important;\n  height: 160px !important;\n  font-size: 4rem !important;\n}`,
  },
  {
    label: "프로필 사진 호버 효과",
    code: `/* 프로필 사진 호버 */\n.vf-avatar {\n  transition: transform 0.3s ease !important;\n}\n.vf-avatar:hover {\n  transform: scale(1.08) rotate(2deg) !important;\n}`,
  },
  {
    label: "섹션 페이드인",
    code: `/* 스크롤 페이드인 */\n@keyframes vf-fadeup {\n  from { opacity: 0; transform: translateY(24px); }\n  to { opacity: 1; transform: translateY(0); }\n}\n\nsection {\n  animation: vf-fadeup 0.7s ease both;\n}`,
  },
  {
    label: "배경 그라데이션",
    code: `/* 배경 그라데이션 */\nbody {\n  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e) !important;\n  background-attachment: fixed !important;\n}`,
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
      }
    }
    load();
  }, [user.id]);

  function insertSnippet(code: string) {
    setCss((prev) => (prev ? `${prev}\n\n${code}` : code));
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
    setToggling(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ custom_mode: !customMode }).eq("id", user.id);
    setCustomMode((v) => !v);
    setToggling(false);
  }

  return (
    <div className="max-w-2xl mx-auto w-full">

      {/* Mode toggle */}
      <div
        className="flex items-center justify-between p-4 rounded-2xl mb-6"
        style={{ border: `1px solid ${customMode ? "#f59e0b55" : "var(--border)"}`, background: customMode ? "rgba(245,158,11,0.05)" : "var(--surface)" }}
      >
        <div>
          <p className="text-sm font-black" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
            {customMode ? "🚧 커스텀 모드 활성화됨" : "기본 모드"}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
            {customMode
              ? `vibefolio.com/${username} 에 커스텀 CSS가 적용중이에요`
              : "커스텀 모드를 켜면 아래 CSS가 명함에 적용돼요"}
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
          {toggling ? "..." : customMode ? "기본 모드로 되돌리기" : "커스텀 모드 켜기"}
        </button>
      </div>

      {/* Snippets */}
      <div className="mb-4">
        <p className="text-xs font-bold mb-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
          빠른 삽입
        </p>
        <div className="flex flex-wrap gap-2">
          {SNIPPETS.map((s) => (
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
      </div>

      {/* CSS Editor */}
      <div className="mb-4">
        <p className="text-xs font-bold mb-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
          커스텀 CSS
        </p>
        <textarea
          value={css}
          onChange={(e) => { setCss(e.target.value); setSaved(false); }}
          placeholder={`/* 여기에 CSS를 입력하세요 */\n\n/* 예시: 배경색 변경 */\n:root {\n  --bg: #0d1117 !important;\n}`}
          rows={18}
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
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-sm font-black transition-opacity hover:opacity-85 disabled:opacity-50"
          style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", border: "none", cursor: saving ? "not-allowed" : "pointer", boxShadow: "0 0 16px var(--blue-glow)" }}
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
          미리보기 →
        </a>
      </div>

      {/* Hint */}
      <p className="text-xs mt-4 leading-relaxed" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
        💡 <code style={{ color: "var(--blue-bright)" }}>.vf-avatar</code>는 프로필 사진,{" "}
        <code style={{ color: "var(--blue-bright)" }}>:root</code>의 CSS 변수로 색상을 바꿀 수 있어요.
        nav(로고/링크복사)는 커스텀 대상에서 제외돼요.
      </p>
    </div>
  );
}
