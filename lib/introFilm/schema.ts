// 소개 영상(화면 없는 작품) 장면 대본 — 모양·검사 한 벌(docs/intro-film.md).
//
// AI는 정해진 장면 종류의 칸 값만 보낸다. 배치·움직임은 틀(render.ts) 몫이라 자유 타임라인은 없다.
// 이 검사는 인제스트·초안 수정·주인 수정이 **같이** 쓴다 — 사본을 만들면 세 입구의 답이 갈라진다.

export const INTRO_STYLE_KEYS = ["hand", "bignum", "cinematic"] as const;
export type IntroStyleKey = (typeof INTRO_STYLE_KEYS)[number];

export type Loc = { en: string; ko: string };
export type DataKind = "sample" | "measured";

type Base = { data?: DataKind; source?: string };
export type HookScene = Base & { kind: "hook"; label: Loc; value: string; alarm?: boolean; line: Loc };
export type StoryScene = Base & { kind: "story"; line: Loc; line2: Loc };
export type ItemsScene = Base & { kind: "items"; items: { value: string; label: Loc; alarm?: boolean }[]; line: Loc };
export type FlowScene = Base & { kind: "flow"; nodes: Loc[]; line: Loc };
export type TerminalScene = Base & { kind: "terminal"; command: string; output: string[]; line: Loc };
export type AlertScene = Base & { kind: "alert"; title: Loc; body: Loc; line: Loc; line2: Loc };
export type StatsScene = Base & { kind: "stats"; stats: { value: string; unit: Loc; label: Loc }[]; line: Loc };
export type EndingScene = Base & { kind: "ending"; line: Loc; line2: Loc; name: Loc };
export type IntroScene = HookScene | StoryScene | ItemsScene | FlowScene | TerminalScene | AlertScene | StatsScene | EndingScene;
export type SceneKind = IntroScene["kind"];

export type IntroFilm = {
  style: { text: IntroStyleKey; mood: IntroStyleKey };
  scenes: IntroScene[];
};

/** 장면 길이(초). 틀이 정한다 — AI가 시간을 정하지 않는다. 10-02 4차: 1.5–2초마다 새 일이 일어나게 1초쯤씩 줄였다. */
export const SCENE_SECONDS: Record<SceneKind, number> = {
  hook: 3.6, story: 3.0, items: 4.2, flow: 4.2, terminal: 4.6, alert: 4.2, stats: 4.0, ending: 5.0,
};
export const SCENE_KINDS = Object.keys(SCENE_SECONDS) as SceneKind[];
export const MIN_SCENES = 3;
export const MAX_SCENES = 8;
/** 숫자를 보여주는 장면 — 예시인지 실측인지 꼭 밝힌다(정직 표시). */
const NEEDS_DATA: ReadonlySet<SceneKind> = new Set(["hook", "items", "terminal", "alert", "stats"]);

export function filmSeconds(film: Pick<IntroFilm, "scenes">): number {
  return film.scenes.reduce((s, sc) => s + (SCENE_SECONDS[sc.kind] ?? 4.6), 0);
}

/** limit·length·empty = 글자 칸 문제일 때만 — 검토 창이 칸 밑에 쉬운 말로 다시 쓴다(message는 AI용 영어). */
export type IntroFilmIssue = { path: string; message: string; limit?: number; length?: number; empty?: boolean };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** null = 통과. 첫 문제 하나만 돌려준다(AI가 고치기 쉽게, 칸 경로를 같이). */
export function introFilmIssue(input: unknown): IntroFilmIssue | null {
  if (!isObj(input)) return { path: "introFilm", message: "introFilm must be an object { style, scenes }" };
  const st = input.style;
  if (!isObj(st)) return { path: "introFilm.style", message: "style must be { text, mood }" };
  for (const k of ["text", "mood"] as const) {
    if (!INTRO_STYLE_KEYS.includes(st[k] as IntroStyleKey)) {
      return { path: `introFilm.style.${k}`, message: `style.${k} must be one of ${INTRO_STYLE_KEYS.join(", ")}` };
    }
  }
  const scenes = input.scenes;
  if (!Array.isArray(scenes)) return { path: "introFilm.scenes", message: "scenes must be an array" };
  if (scenes.length < MIN_SCENES || scenes.length > MAX_SCENES) {
    return { path: "introFilm.scenes", message: `use ${MIN_SCENES}–${MAX_SCENES} scenes (got ${scenes.length})` };
  }
  for (let i = 0; i < scenes.length; i++) {
    const issue = sceneIssue(scenes[i], `introFilm.scenes[${i}]`);
    if (issue) return issue;
  }
  return null;
}

function str(v: unknown, path: string, max: number, min = 1): IntroFilmIssue | null {
  if (typeof v !== "string") return { path, message: "must be a string" };
  const n = [...v.trim()].length;
  if (n < min) return { path, message: "must not be empty", empty: true };
  if (n > max) return { path, message: `too long (${n} > ${max} characters) — shorten it`, limit: max, length: n };
  return null;
}
function loc(v: unknown, path: string, max: number): IntroFilmIssue | null {
  if (!isObj(v)) return { path, message: "must be { en, ko } — every on-screen text needs English and Korean" };
  return str(v.en, `${path}.en`, max) ?? str(v.ko, `${path}.ko`, max);
}
function list(v: unknown, path: string, min: number, max: number): IntroFilmIssue | null {
  if (!Array.isArray(v)) return { path, message: "must be an array" };
  if (v.length < min || v.length > max) return { path, message: `use ${min}–${max} entries (got ${v.length})` };
  return null;
}

function sceneIssue(sc: unknown, p: string): IntroFilmIssue | null {
  if (!isObj(sc)) return { path: p, message: "scene must be an object" };
  const kind = sc.kind as SceneKind;
  if (!SCENE_KINDS.includes(kind)) return { path: `${p}.kind`, message: `kind must be one of ${SCENE_KINDS.join(", ")}` };
  if (sc.data != null && sc.data !== "sample" && sc.data !== "measured") {
    return { path: `${p}.data`, message: `data must be "sample" or "measured"` };
  }
  if (NEEDS_DATA.has(kind) && sc.data == null) {
    return { path: `${p}.data`, message: `say whether these numbers are "sample" (made-up example) or "measured" (real, with source)` };
  }
  if (sc.data === "measured") {
    const e = str(sc.source, `${p}.source`, 80);
    if (e) return { ...e, message: `measured data needs a source (file, log or doc it came from) — ${e.message}` };
  }
  switch (kind) {
    case "hook":
      return loc(sc.label, `${p}.label`, 40) ?? str(sc.value, `${p}.value`, 12) ?? loc(sc.line, `${p}.line`, 60);
    case "story":
      return loc(sc.line, `${p}.line`, 60) ?? loc(sc.line2, `${p}.line2`, 40);
    case "items": {
      const e = list(sc.items, `${p}.items`, 2, 6);
      if (e) return e;
      for (let i = 0; i < (sc.items as unknown[]).length; i++) {
        const it = (sc.items as unknown[])[i], ip = `${p}.items[${i}]`;
        if (!isObj(it)) return { path: ip, message: "item must be { value, label }" };
        const ie = str(it.value, `${ip}.value`, 8) ?? loc(it.label, `${ip}.label`, 20);
        if (ie) return ie;
      }
      return loc(sc.line, `${p}.line`, 60);
    }
    case "flow": {
      const e = list(sc.nodes, `${p}.nodes`, 2, 5);
      if (e) return e;
      for (let i = 0; i < (sc.nodes as unknown[]).length; i++) {
        const ne = loc((sc.nodes as unknown[])[i], `${p}.nodes[${i}]`, 20);
        if (ne) return ne;
      }
      return loc(sc.line, `${p}.line`, 60);
    }
    case "terminal": {
      const e = str(sc.command, `${p}.command`, 60) ?? list(sc.output, `${p}.output`, 1, 8);
      if (e) return e;
      for (let i = 0; i < (sc.output as unknown[]).length; i++) {
        const oe = str((sc.output as unknown[])[i], `${p}.output[${i}]`, 60);
        if (oe) return oe;
      }
      return loc(sc.line, `${p}.line`, 60);
    }
    case "alert":
      return loc(sc.title, `${p}.title`, 32) ?? loc(sc.body, `${p}.body`, 48) ?? loc(sc.line, `${p}.line`, 32) ?? loc(sc.line2, `${p}.line2`, 48);
    case "stats": {
      const e = list(sc.stats, `${p}.stats`, 2, 4);
      if (e) return e;
      for (let i = 0; i < (sc.stats as unknown[]).length; i++) {
        const it = (sc.stats as unknown[])[i], ip = `${p}.stats[${i}]`;
        if (!isObj(it)) return { path: ip, message: "stat must be { value, unit, label }" };
        const ie = str(it.value, `${ip}.value`, 6) ?? loc(it.unit, `${ip}.unit`, 8) ?? loc(it.label, `${ip}.label`, 24);
        if (ie) return ie;
      }
      return loc(sc.line, `${p}.line`, 60);
    }
    case "ending":
      return loc(sc.line, `${p}.line`, 40) ?? loc(sc.line2, `${p}.line2`, 40) ?? loc(sc.name, `${p}.name`, 48);
  }
  return null;
}

/** 화면 구석 정직 표시 글 — 예시면 "Sample data", 실측이면 출처. */
export function honestyLabel(sc: IntroScene, locale: "en" | "ko"): string {
  if (sc.data === "measured") return (locale === "ko" ? "실측 · " : "Measured · ") + (sc.source ?? "");
  if (sc.data === "sample") return locale === "ko" ? "예시 자료 · 그림" : "Sample data · Illustration";
  return "";
}
