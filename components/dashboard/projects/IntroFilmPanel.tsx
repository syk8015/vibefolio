"use client";

// 초안 검토 창의 소개 영상 칸(2026-10-02, docs/intro-film.md) — "글자 + 분위기" 두 줄 고르기와 장면 글자 고치기.
// 고르거나 고치면 왼쪽 미리보기가 바로 바뀌고(onChange), 잠깐 뒤 서버 검사를 거쳐 저장한다(onSave → 초안 PATCH).
// 장면 순서·그림 같은 큰 변경은 이 칸이 아니라 [고칠 점 적기]로 AI에게 맡긴다(09-30 결정).
import { INTRO_STYLE_KEYS, type IntroFilm, type IntroScene, type IntroStyleKey, type Loc } from "@/lib/introFilm/schema";
import { useT } from "@/lib/i18n/client";

type Props = {
  film: IntroFilm;
  /** 지금 미리보기에 보이는 언어 — 장면 글자는 이 언어 판을 고친다. */
  locale: "en" | "ko";
  error: string | null;
  onChange: (next: IntroFilm) => void;
};

/** 장면에서 고칠 수 있는 글자 칸들(값·명령은 언어가 없다). */
const FIELDS = ["label", "value", "line", "line2", "title", "body", "command", "name"] as const;

export function IntroFilmPanel({ film, locale, error, onChange }: Props) {
  const { t } = useT();
  const setStyle = (k: "text" | "mood", v: IntroStyleKey) => onChange({ ...film, style: { ...film.style, [k]: v } });
  const setField = (i: number, key: string, v: string) => {
    const scenes = film.scenes.map((sc, j) => {
      if (j !== i) return sc;
      const cur = (sc as Record<string, unknown>)[key];
      const next = typeof cur === "string" ? v : { ...(cur as Loc), [locale]: v };
      return { ...sc, [key]: next } as IntroScene;
    });
    onChange({ ...film, scenes });
  };
  const row = (k: "text" | "mood", label: string) => (
    <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--font-nunito)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
      <div role="group" aria-label={label} className="flex" style={{ gap: 2, padding: 3, borderRadius: 999, background: "var(--surface-soft)" }}>
        {INTRO_STYLE_KEYS.map((s) => {
          const on = film.style[k] === s;
          return (
            <button
              key={s} type="button" aria-pressed={on} onClick={() => setStyle(k, s)}
              style={{
                border: 0, borderRadius: 999, padding: "6px 12px", cursor: "pointer",
                fontFamily: "var(--font-nunito)", fontSize: 13, fontWeight: 600,
                background: on ? "var(--surface)" : "transparent",
                color: on ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: on ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              {t.projects.reviewIntroStyles[s]}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div className="flex flex-col" style={{ gap: 8, padding: "0 4px" }}>
        {row("text", t.projects.reviewIntroText)}
        {row("mood", t.projects.reviewIntroMood)}
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {film.scenes.map((sc, i) => (
          <li key={i} style={{ padding: "8px 12px", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <p style={{ margin: "0 0 4px", fontFamily: "var(--font-nunito)", fontSize: 12, color: "var(--text-muted)" }}>
              {t.projects.reviewIntroKinds[sc.kind]}
              {sc.data === "sample" ? ` · ${t.projects.reviewIntroSample}` : sc.data === "measured" ? ` · ${t.projects.reviewIntroMeasured}` : ""}
            </p>
            {FIELDS.map((key) => {
              const v = (sc as Record<string, unknown>)[key];
              if (v == null) return null;
              const text = typeof v === "string" ? v : (v as Loc)[locale] ?? "";
              return (
                <input
                  key={key} type="text" value={text} aria-label={`${t.projects.reviewIntroKinds[sc.kind]} ${key}`}
                  onChange={(e) => setField(i, key, e.target.value)}
                  className="vf-input" style={{ padding: "5px 9px", borderRadius: 8, marginTop: 4, fontSize: 14 }}
                />
              );
            })}
          </li>
        ))}
      </ol>
      {error && <p role="alert" style={{ margin: 0, padding: "0 4px", fontFamily: "var(--font-nunito)", fontSize: 13, color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
