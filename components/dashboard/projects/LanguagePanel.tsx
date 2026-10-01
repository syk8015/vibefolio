"use client";

import { useState } from "react";
import { stepTakesCaption, type DemoScript } from "@/lib/demoScript";
import {
  CAPTION_MAX, SITE_LOCALES, filmPlan, normalizeAppLanguages, normalizeLocale,
  type SiteLocale,
} from "@/lib/workLanguages";
import { useT } from "@/lib/i18n/client";

// 초안 검토 창의 언어 칸(2026-09-29 작품 두 언어) — 2026-10-01 덜어내기 "라"부터는 촬영 줄의
// [보기] 안에 접혀 있다. 장면 자막 목록(눌러서 고침) 아래에 작은 표 한 벌: 기본 언어·앱 화면·
// 보는 사람 언어마다 무엇을 보나(그 언어 화면으로 찍은 영상인지, 다른 언어 영상 + 자막인지).
// 자막은 대본 장면의 caption이라 저장은 대본 저장(onSaveScript)과 같은 길이다.
// 판정은 서버 게이트와 같은 상수(CAPTION_MAX)·같은 규칙(뒤로가기 장면은 자막 없음, 비우기 금지).
export type DetailRow = { label: string; value: string };

export function LanguagePanel({ primary, app, script, scriptLoading, hasOwnVideo, lead = [], onSaveScript }: {
  primary: unknown;
  app: unknown;
  script: DemoScript | null;
  scriptLoading: boolean;
  hasOwnVideo: boolean;
  /** 언어 줄 앞에 같은 표로 붙일 줄(검토 창의 로그인 방법 등). */
  lead?: DetailRow[];
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
      <div className="flex flex-col" style={{ gap: 8 }}>
        <Details rows={lead} />
        <p style={{ ...mutedText, fontSize: 13 }}>{t.projects.reviewLangLegacy}</p>
      </div>
    );
  }

  const plan = filmPlan(main, apps);
  const steps = script?.steps ?? [];
  const captionCount = (l: SiteLocale) =>
    steps.filter((s) => s.caption?.[l]).length;
  const viewerLine = (l: SiteLocale) => {
    if (plan.main === l || plan.extra === l) return t.projects.reviewLangFilm(name(l));
    // 대본(비공개 칸)을 아직 못 받았으면 "자막 0장면"은 거짓이다 — 자리표시만.
    if (scriptLoading && !steps.length) return "…";
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

  // 직접 준 영상이면 보는 사람 줄은 둘 다 "그 영상"이라 빼고, 무슨 말로 올렸는지만 남긴다.
  const rows: DetailRow[] = [
    ...lead,
    { label: t.projects.reviewLangPrimaryRow, value: name(main) },
    { label: t.projects.reviewLangAppRow, value: apps.length ? apps.map(name).join(" · ") : t.projects.reviewLangAppNone },
    ...(hasOwnVideo ? [] : SITE_LOCALES.map((l) => ({ label: t.projects.reviewLangViewer(name(l)), value: viewerLine(l) }))),
  ];

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {!hasOwnVideo && plan.captions.map((locale) => (
        <div key={locale}>
          {/* 자막 언어가 하나면 촬영 줄("영어 자막 포함")이 이미 말한다 — 둘일 때만 이름을 단다 */}
          {plan.captions.length > 1 && (
            <p style={{ ...mutedText, fontSize: 13, marginBottom: 4 }}>{t.projects.reviewCaptionsTitle(name(locale))}</p>
          )}
          {scriptLoading && !steps.length ? (
            <div aria-busy="true" className="rounded-xl animate-pulse" style={{ height: 56, background: "var(--surface-sunken)" }} />
          ) : (
            <ol style={{ listStyle: "none", margin: 0, padding: "0 4px", display: "flex", flexDirection: "column", gap: 2 }}>
              {steps.map((s, i) => !stepTakesCaption(s) && !s.caption ? null : (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 10, alignItems: "baseline" }}>
                  <span className="vf-mono" style={{ ...mutedText, fontSize: 12 }}>{i + 1}</span>
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
                      <p style={{ ...mutedText, fontSize: 13, margin: "3px 0 0", color: error ? "var(--danger)" : undefined }}>
                        {error ?? `${[...value.trim()].length}/${CAPTION_MAX} · Enter ↵ · Esc`}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button" onClick={() => begin(i, locale)} title={t.projects.reviewCaptionHint}
                      style={{
                        textAlign: "left", background: "transparent", border: "none", padding: "3px 0", cursor: "text",
                        fontFamily: "var(--font-nunito)", fontSize: 14, lineHeight: 1.5,
                        color: s.caption?.[locale] ? "var(--text-primary)" : "var(--danger)",
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
      <Details rows={rows} />
    </div>
  );
}

// 작은 표 — 이름(옅게) · 값. 접힌 [보기] 안에서만 보이는 부가 정보라 13px.
function Details({ rows }: { rows: DetailRow[] }) {
  if (!rows.length) return null;
  return (
    <dl
      style={{
        margin: 0, padding: "0 4px", display: "grid", gridTemplateColumns: "max-content minmax(0, 1fr)",
        gap: "4px 16px", fontFamily: "var(--font-nunito)", fontSize: 13, lineHeight: 1.55,
      }}
    >
      {rows.map((r) => (
        <div key={r.label} style={{ display: "contents" }}>
          <dt style={{ color: "var(--text-secondary)" }}>{r.label}</dt>
          <dd style={{ margin: 0, fontWeight: 500, overflowWrap: "anywhere", color: "var(--text-primary)" }}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const mutedText: React.CSSProperties = {
  margin: 0, fontFamily: "var(--font-nunito)", fontSize: "0.9rem", color: "var(--text-secondary)",
};
