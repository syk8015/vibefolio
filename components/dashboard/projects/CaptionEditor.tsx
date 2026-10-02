"use client";

import { useState } from "react";
import { CAPTION_MAX, SITE_LOCALES, type CaptionTrack, type SiteLocale } from "@/lib/workLanguages";
import { useT } from "@/lib/i18n/client";

// 수정 창 '더 보기 › 자막'(2026-10-02) — 이미 찍힌 영상 위에 얹히는 자막의 글을 줄마다 고친다.
// 시각은 촬영 로봇이 정한 그대로, 글만. 시간표는 워커만 쓰는 칸이라 서버 라우트
// (/api/projects/[id]/captions)가 주인 확인 뒤 쓴다. 폼의 [저장하기]와 따로 Enter 한 번에 저장된다 —
// 영상 위 자막은 저장 즉시 바뀌니 "저장 안 한 칸" 점이 필요 없다.
// 검토 창 LanguagePanel의 자막 목록과 같은 손맛(눌러서 고침 · Enter 저장 · Esc 취소).

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export function CaptionEditor({ projectId, track, onSaved }: {
  projectId: string;
  track: CaptionTrack;
  onSaved: (next: CaptionTrack) => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState<{ locale: SiteLocale; index: number } | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ locale: SiteLocale; index: number } | null>(null);
  const locales = SITE_LOCALES.filter((l) => track[l]?.length);

  const begin = (locale: SiteLocale, index: number) => {
    if (saving) return;
    setError(null);
    setSaved(null);
    setValue(track[locale]?.[index]?.text ?? "");
    setEditing({ locale, index });
  };
  const save = async () => {
    if (!editing) return;
    const v = value.replace(/\s+/g, " ").trim();
    if (!v) { setError(t.projects.reviewCaptionRequired); return; }
    if ([...v].length > CAPTION_MAX) { setError(t.projects.reviewCaptionTooLong(CAPTION_MAX)); return; }
    if (v === track[editing.locale]?.[editing.index]?.text) { setEditing(null); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/captions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: editing.locale, index: editing.index, text: v }),
      });
      const body = await res.json().catch(() => null) as { captions?: CaptionTrack; error?: string } | null;
      if (!res.ok || !body?.captions) { setError(body?.error ?? t.projects.reviewSaveFailed); return; }
      onSaved(body.captions);
      setSaved(editing);
      setEditing(null);
    } catch {
      setError(t.projects.reviewSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <p style={{ ...muted, fontSize: "0.8125rem" }}>{t.projectForm.captionsNote}</p>
      {locales.map((locale) => (
        <div key={locale}>
          {locales.length > 1 && (
            <p style={{ ...muted, fontSize: "0.8125rem", marginBottom: 4 }}>{t.projects.reviewCaptionsTitle(t.projects.langNames[locale])}</p>
          )}
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            {track[locale]!.map((cue, i) => {
              const open = editing?.locale === locale && editing.index === i;
              return (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "36px minmax(0, 1fr)", gap: 8, alignItems: "baseline" }}>
                  <span className="vf-mono" style={{ ...muted, fontSize: 12 }}>{clock(cue.start)}</span>
                  {open ? (
                    <div>
                      <input
                        autoFocus value={value} disabled={saving}
                        onChange={(e) => { setValue(e.target.value); setError(null); }}
                        onKeyDown={(e) => {
                          // 폼 안이라 Enter가 [저장하기](폼 전체)로 새지 않게 막는다.
                          if (e.key === "Enter") { e.preventDefault(); void save(); }
                          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setEditing(null); setError(null); }
                        }}
                        className="vf-input-compact w-full"
                        aria-label={t.projects.reviewCaptionsTitle(t.projects.langNames[locale])}
                      />
                      <p role={error ? "alert" : undefined} style={{ ...muted, fontSize: 13, margin: "3px 0 0", color: error ? "var(--danger)" : undefined }}>
                        {error ?? `${[...value.trim()].length}/${CAPTION_MAX} · Enter ↵ · Esc`}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button" onClick={() => begin(locale, i)} title={t.projects.reviewCaptionHint}
                      style={{
                        textAlign: "left", background: "transparent", border: "none", padding: "3px 0", cursor: "text",
                        fontFamily: "var(--font-nunito)", fontSize: 14, lineHeight: 1.5, color: "var(--text-primary)",
                      }}
                    >
                      {cue.text}
                      {saved?.locale === locale && saved.index === i && (
                        <span role="status" style={{ ...muted, fontSize: 12, marginLeft: 8 }}>✓ {t.projectForm.captionSaved}</span>
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

const muted: React.CSSProperties = {
  margin: 0, fontFamily: "var(--font-nunito)", color: "var(--text-secondary)", lineHeight: 1.5,
};
