"use client";

import { useState } from "react";
import type { DemoScript } from "@/lib/demoScript";
import {
  CAPTION_MAX, SITE_LOCALES, filmPlan, normalizeAppLanguages, normalizeLocale,
  type SiteLocale,
} from "@/lib/workLanguages";
import { useT } from "@/lib/i18n/client";

// 초안 검토 창의 "언어" 칸(2026-09-29 작품 두 언어 — 시안 LangReview 보드).
//
// 두 줄로 답한다: 한국어로 보는 사람·영어로 보는 사람이 각각 무엇을 보게 되나(그 언어 화면으로
// 찍은 영상인지, 다른 언어 영상 + 자막인지). 그 아래 자막 목록 — 글자를 누르면 그 자리에서
// 고친다. 자막은 대본 장면의 caption이라 저장은 대본 저장(onSaveScript)과 같은 길이다.
// 판정은 서버 게이트와 같은 상수(CAPTION_MAX)·같은 규칙(뒤로가기 장면은 자막 없음, 비우기 금지).
export function LanguagePanel({ primary, app, script, scriptLoading, hasOwnVideo, headId, onSaveScript }: {
  primary: unknown;
  app: unknown;
  script: DemoScript | null;
  scriptLoading: boolean;
  hasOwnVideo: boolean;
  headId: string;
  onSaveScript: (next: DemoScript) => Promise<void>;
}) {
  const { t } = useT();
  const main = normalizeLocale(primary);
  const apps = normalizeAppLanguages(app);
  const name = (l: SiteLocale) => t.projects.langNames[l];

  const [editing, setEditing] = useState<{ step: number; locale: SiteLocale } | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!main || !apps) {
    return (
      <section aria-labelledby={headId}>
        <h3 id={headId} style={headStyle}>{t.projects.reviewLangTitle}</h3>
        <p style={mutedText}>{t.projects.reviewLangLegacy}</p>
      </section>
    );
  }

  const plan = filmPlan(main, apps);
  const steps = script?.steps ?? [];
  const captionCount = (l: SiteLocale) =>
    steps.filter((s) => s.action !== "navigate" && s.caption?.[l]).length;
  const viewerLine = (l: SiteLocale) => {
    if (hasOwnVideo) return t.projects.reviewVideoOwn;
    if (plan.main === l || plan.extra === l) return t.projects.reviewLangFilm(name(l));
    return t.projects.reviewLangCaptioned(name(plan.main), name(l), captionCount(l));
  };

  const begin = (step: number, locale: SiteLocale) => {
    if (saving) return;
    setError(null);
    setValue(steps[step]?.caption?.[locale] ?? "");
    setEditing({ step, locale });
  };
  const save = async () => {
    if (!editing || !script) return;
    const v = value.replace(/\s+/g, " ").trim();
    if (!v) { setError(t.projects.reviewCaptionRequired); return; }
    if ([...v].length > CAPTION_MAX) { setError(t.projects.reviewCaptionTooLong(CAPTION_MAX)); return; }
    const cur = script.steps[editing.step]?.caption?.[editing.locale] ?? "";
    if (v === cur) { setEditing(null); return; }
    const next: DemoScript = {
      ...script,
      steps: script.steps.map((s, i) =>
        i === editing.step ? { ...s, caption: { ...(s.caption ?? {}), [editing.locale]: v } } : s),
    };
    setSaving(true);
    try {
      await onSaveScript(next);
      setEditing(null);
    } catch {
      setError(t.projects.reviewSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const rows: { label: string; value: string }[] = [
    { label: t.projects.reviewLangPrimaryRow, value: name(main) },
    { label: t.projects.reviewLangAppRow, value: apps.length ? apps.map(name).join(" · ") : t.projects.reviewLangAppNone },
    ...SITE_LOCALES.map((l) => ({ label: t.projects.reviewLangViewer(name(l)), value: viewerLine(l) })),
  ];

  return (
    <section aria-labelledby={headId}>
      <h3 id={headId} style={headStyle}>{t.projects.reviewLangTitle}</h3>
      <ul className="rounded-2xl" style={{ listStyle: "none", margin: 0, padding: 0, overflow: "hidden", background: "var(--surface-sunken)" }}>
        {rows.map((r, i) => (
          <li key={r.label} style={{ padding: "11px 16px", borderTop: i ? "1px solid var(--surface)" : "none", display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <span style={{ ...mutedText, fontSize: "0.85rem" }}>{r.label}</span>
            <span style={{ fontFamily: "var(--font-nunito)", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>{r.value}</span>
          </li>
        ))}
      </ul>

      {!hasOwnVideo && plan.captions.map((locale) => (
        <div key={locale} style={{ marginTop: 14 }}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3" style={{ marginBottom: 6 }}>
            <span style={{ fontFamily: "var(--font-nunito)", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
              {t.projects.reviewCaptionsTitle(name(locale))}
            </span>
            <span style={{ ...mutedText, fontSize: "0.8rem" }}>{t.projects.reviewCaptionHint}</span>
          </div>
          {scriptLoading && !steps.length ? (
            <div aria-busy="true" className="rounded-xl animate-pulse" style={{ height: 56, background: "var(--surface-sunken)" }} />
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {steps.map((s, i) => s.action === "navigate" ? null : (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 8, alignItems: "baseline" }}>
                  <span className="vf-mono" style={{ ...mutedText, fontSize: "0.78rem" }}>{i + 1}</span>
                  {editing?.step === i && editing.locale === locale ? (
                    <div>
                      <input
                        autoFocus value={value} disabled={saving}
                        onChange={(e) => { setValue(e.target.value); setError(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); void save(); }
                          if (e.key === "Escape") { e.preventDefault(); setEditing(null); setError(null); }
                        }}
                        className="vf-input-compact w-full"
                        aria-label={t.projects.reviewCaptionsTitle(name(locale))}
                      />
                      <p style={{ ...mutedText, fontSize: "0.78rem", margin: "3px 0 0", color: error ? "#b34747" : undefined }}>
                        {error ?? `${[...value.trim()].length}/${CAPTION_MAX} · Enter ↵ · Esc`}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button" onClick={() => begin(i, locale)}
                      style={{
                        textAlign: "left", background: "transparent", border: "none", padding: "3px 0", cursor: "pointer",
                        fontFamily: "var(--font-nunito)", fontSize: "0.9rem", lineHeight: 1.5,
                        color: s.caption?.[locale] ? "var(--text-primary)" : "#b34747",
                      }}
                    >
                      {s.caption?.[locale] || t.projects.reviewCaptionEmpty}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </section>
  );
}

const headStyle: React.CSSProperties = {
  margin: "0 0 12px", fontFamily: "var(--font-nunito)", fontSize: "1.15rem", fontWeight: 700,
  letterSpacing: "-0.015em", color: "var(--text-primary)",
};
const mutedText: React.CSSProperties = {
  margin: 0, fontFamily: "var(--font-nunito)", fontSize: "0.9rem", color: "var(--text-secondary)",
};
