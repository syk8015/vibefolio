"use client";

// 초안 검토 창의 소개 영상 칸(2026-10-02, docs/intro-film.md) — "글자 + 분위기" 두 줄 고르기와 장면 글자 고치기.
// 장면 순서·그림 같은 큰 변경은 이 칸이 아니라 [고칠 점 적기]로 AI에게 맡긴다(09-30 결정).
//
// 덜어내기(10-02, 다른 화면과 같은 기준): 장면은 한 줄씩 — 번호 · 종류 · 그 장면의 글자. 지금 재생 중인 장면은
// 옅게 칠해지고, 줄을 누르면 그 장면만 입력칸으로 펼친다(한 번에 한 장면). 펼치면 왼쪽 무대가 그 장면에 멈춰
// 고치는 글자를 그 자리에서 보여준다(DraftReviewModal). 글자가 길거나 비면 그 칸 바로 밑에 쉬운 말 한 줄 —
// 검사기의 영어 문장(AI용)은 보이지 않는다. 그동안 미리보기와 저장은 마지막으로 맞던 판에 머문다.
import { INTRO_STYLE_KEYS, type IntroFilm, type IntroFilmIssue, type IntroScene, type IntroStyleKey, type Loc, type SceneKind } from "@/lib/introFilm/schema";
import { Segmented } from "@/components/Segmented";
import { useT } from "@/lib/i18n/client";

type Props = {
  /** 입력칸이 보여주는 판 — 틀린 글자가 들어 있을 수 있다. */
  film: IntroFilm;
  /** 지금 미리보기에 보이는 언어 — 장면 글자는 이 언어 판을 고친다. */
  locale: "en" | "ko";
  /** 지금 재생 중인 장면 */
  playing: number;
  /** 펼친 장면(없으면 null) */
  open: number | null;
  /** 지금 판의 첫 문제(introFilmIssue) — 그 칸 밑에 쉬운 말로 보인다. */
  issue: IntroFilmIssue | null;
  onOpen: (i: number | null) => void;
  onChange: (next: IntroFilm) => void;
};

/** 장면 종류마다 고칠 수 있는 글자 칸 — 화면에 나오는 순서대로. 항목·흐름·숫자 목록은 [고칠 점 적기]로. */
const FIELDS: Record<SceneKind, readonly string[]> = {
  hook: ["label", "value", "line"],
  story: ["line", "line2"],
  items: ["line"],
  flow: ["line"],
  terminal: ["command", "line"],
  alert: ["title", "body", "line", "line2"],
  stats: ["line"],
  ending: ["line", "line2", "name"],
};

/** "introFilm.scenes[2].line.ko" → 2번째 장면의 line 칸(언어 칸이면 그 언어). */
export function issueTarget(issue: IntroFilmIssue | null): { scene: number; key: string; loc: string | null } | null {
  const m = issue?.path.match(/scenes\[(\d+)\]\.([a-zA-Z0-9]+)(?:\.(en|ko))?$/);
  return m ? { scene: Number(m[1]), key: m[2], loc: m[3] ?? null } : null;
}

const textOf = (sc: IntroScene, key: string, locale: "en" | "ko") => {
  const v = (sc as Record<string, unknown>)[key];
  if (v == null) return null;
  return typeof v === "string" ? v : (v as Loc)[locale] ?? "";
};

export function IntroFilmPanel({ film, locale, playing, open, issue, onOpen, onChange }: Props) {
  const { t } = useT();
  const tp = t.projects;
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
  const target = issueTarget(issue);
  const issueText = issue?.empty ? tp.reviewIntroEmpty
    : issue?.limit != null && issue.length != null ? tp.reviewIntroTooLong(issue.limit, issue.length)
    : null;
  const styleOptions = INTRO_STYLE_KEYS.map((s) => ({ value: s, label: tp.reviewIntroStyles[s] }));
  const pick = (k: "text" | "mood", label: string) => (
    <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--font-nunito)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
      <Segmented<IntroStyleKey> label={label} value={film.style[k]} options={styleOptions} onPick={(v) => setStyle(k, v)} />
    </div>
  );
  const small: React.CSSProperties = { fontFamily: "var(--font-nunito)", fontSize: 13, lineHeight: 1.5 };

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <div className="flex flex-col" style={{ gap: 8, padding: "0 4px" }}>
        {pick("text", tp.reviewIntroText)}
        {pick("mood", tp.reviewIntroMood)}
      </div>
      <ol className="flex flex-col" style={{ listStyle: "none", margin: 0, padding: 0, gap: 2 }}>
        {film.scenes.map((sc, i) => {
          const kind = tp.reviewIntroKinds[sc.kind];
          const name = tp.reviewIntroScene(i + 1, kind);
          const fields = FIELDS[sc.kind].filter((key) => textOf(sc, key, locale) != null);
          const isOpen = open === i;
          const head = (
            <span className="flex items-baseline" style={{ ...small, gap: 8 }}>
              <span style={{ minWidth: 14, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
              <span>
                <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{kind}</span>
                {/* 숫자 장면의 정직 표시 — 예시인지 실측인지는 늘 보인다 */}
                {sc.data && <span style={{ color: "var(--text-muted)" }}>{` · ${sc.data === "sample" ? tp.reviewIntroSample : tp.reviewIntroMeasured}`}</span>}
              </span>
            </span>
          );
          return (
            <li key={i}>
              {isOpen ? (
                <div className="flex flex-col" style={{ gap: 6, padding: "10px 12px", borderRadius: 12, background: "var(--surface-soft)" }}>
                  <button type="button" onClick={() => onOpen(null)} aria-expanded aria-label={name}
                    style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}>
                    {head}
                  </button>
                  {fields.map((key, k) => {
                    const bad = !!target && target.scene === i && target.key === key && (!target.loc || target.loc === locale);
                    return (
                      <div key={key} className="flex flex-col" style={{ gap: 4, paddingLeft: 22 }}>
                        <input
                          type="text" value={textOf(sc, key, locale) ?? ""} autoFocus={k === 0}
                          aria-label={`${name} · ${k + 1}/${fields.length}`} aria-invalid={bad || undefined}
                          onChange={(e) => setField(i, key, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); onOpen(null); } }}
                          className="vf-input"
                          style={{ padding: "7px 10px", borderRadius: 8, fontSize: 14, background: "var(--surface)", ...(bad ? { boxShadow: "inset 0 0 0 1px var(--danger)" } : null) }}
                        />
                        {bad && issueText && <p role="alert" style={{ ...small, margin: 0, color: "var(--danger)" }}>{issueText}</p>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <button type="button" onClick={() => onOpen(i)} aria-expanded={false} aria-label={name}
                  className="vf-row-button" data-active={playing === i ? "true" : undefined}
                  style={{ padding: "10px 12px" }}>
                  {head}
                  <span style={{
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    marginTop: 2, paddingLeft: 22, fontFamily: "var(--font-nunito)", fontSize: 14, lineHeight: 1.5,
                    color: target?.scene === i ? "var(--danger)" : "var(--text-primary)",
                  }}>
                    {fields.map((key) => textOf(sc, key, locale)).filter(Boolean).join(" · ")}
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
