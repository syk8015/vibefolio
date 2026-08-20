// Script data contract (plan §6.1). A Script is a "full path from the initial
// screen" — for M0 (TodoMVC) it is hand-written; from M1 on, explore.ts produces
// it from a read-only computer-use pass. Selectors should be stable
// (data-testid > role+name > stable text > short CSS); replay.ts recomputes live
// positions from them each frame so moving/relaid-out elements still work.
// `x`/`y` are the logical-px coordinates the action was observed at during explore
// (same 1280×720 space replay records in). Selector is primary — replay recomputes
// the live position from it each frame — but a coordinate fallback keeps replay
// robust when an explore-derived selector doesn't resolve on the reset page.
// holdMs: 촬영 대본(demoScript)의 스텝별 hold(결과를 몇 초 보여줄지)가 explore의
// mark_step 매핑을 타고 그 스텝의 첫 기록 액션에 붙는다. 없으면 replay 기본
// HOLD_MS. 대본이 없던 시절의 스크립트와 완전 호환(전부 optional).
export type ScriptAction = ScriptActionBase & { holdMs?: number };
type ScriptActionBase =
  | { kind: "click"; selector: string; x?: number; y?: number; label?: string }
  | { kind: "type"; selector: string; text: string; submit?: boolean; x?: number; y?: number; label?: string }
  | { kind: "scroll"; dy: number; dx?: number }
  // Non-typing key beat (standalone Enter, arrows, Tab…) — replay presses it so
  // keyboard-driven UI (slider nudges, focus moves) stays in sync (audit A-C2).
  | { kind: "key"; key: string }
  // M1 (explore) emits these; replay handles them then.
  | { kind: "hover"; selector: string; x?: number; y?: number }
  // viaKey: the dismissal explore observed was an Escape press (no element to
  // click on the reset page) — replay presses Escape instead of clicking.
  | { kind: "dismiss"; selector: string; viaKey?: boolean }
  // Drag gesture (slider, reorder handle, canvas). Unlike click, BOTH coordinate
  // pairs are required — the gesture IS the start→end vector; the selector only
  // re-anchors it: replay resolves the live start from the selector and translates
  // the end by the same offset, preserving the drag's shape relative to the control.
  | { kind: "drag"; selector: string; x: number; y: number; toX: number; toY: number; label?: string }
  // Freehand stroke (drawing canvas): ONE continuous pointer-down polyline through
  // `points` in order. computer-use's left_click_drag can only express a straight
  // start→end vector, so explore emits this from its draw_path tool instead. Same
  // re-anchor policy as drag: resolve the live element via the selector and shift
  // EVERY point by however far it moved — the stroke's shape is what matters.
  | { kind: "path"; selector: string; points: [number, number][]; label?: string }
  // Camera-only emphasis beat (2026-08-20): magnify a REGION of the page for the
  // hold duration — no cursor move, no page interaction. The creator's script says
  // "여길 자세히" and the film answers with a crop, not a barely-visible cursor
  // parked on top of a video. x/y = region CENTER, w/h = region size (logical px);
  // the selector re-anchors the live rect on the reset page, w/h re-measure from
  // its boundingBox when it resolves (recorded w/h are the coordinate fallback).
  | { kind: "focus"; selector: string; x: number; y: number; w: number; h: number; label?: string };

export type Script = {
  actions: ScriptAction[];
  loginGated: boolean;
  notes?: string;
};

// Collapse the explore pass's scroll fumbling (down 300 → up 100 → down 800 while
// hunting for a section) into ONE smooth net scroll, so the film never shows the
// search. Rules:
//   - Only CONSECUTIVE scroll actions merge (any other action breaks the run).
//   - A scroll carrying holdMs starts a NEW group: holdMs marks a shot-list
//     step's first action, and merging across it would erase that beat's framing
//     pause. Trailing hold-less scrolls merge INTO the group before them.
//   - A group whose net travel is a wash (|dy| and |dx| < 80) is dropped entirely
//     — unless it holds a beat (holdMs), in which case it stays as a pause.
// Pure and record-time only: replay sees the already-coalesced script.
export function coalesceScrolls(actions: ScriptAction[]): ScriptAction[] {
  const out: ScriptAction[] = [];
  const isWash = (a: { dy: number; dx?: number }) =>
    Math.abs(a.dy) < 80 && Math.abs(a.dx ?? 0) < 80;
  for (const act of actions) {
    const prev = out[out.length - 1];
    if (
      act.kind === "scroll" &&
      prev?.kind === "scroll" &&
      act.holdMs === undefined
    ) {
      prev.dy += act.dy;
      if (act.dx) prev.dx = (prev.dx ?? 0) + act.dx;
      continue;
    }
    out.push({ ...act });
  }
  return out.filter((a) => a.kind !== "scroll" || a.holdMs !== undefined || !isWash(a));
}

// M0 target — TodoMVC React (no login, no server/DB, deterministic, rich client
// interactions). Exercises: type+submit (same input reused), a long jump that
// triggers a push-in (toggle checkbox top-left), and short/long filter hops.
export const TODOMVC_URL = "https://todomvc.com/examples/react/dist/";

// Layout note (pinned 1280×720, measured): TodoMVC is a narrow column, so the
// ONLY straight-line jumps ≥ VIEW_H/2 (=360px, the zoom threshold) are between the
// top input (~790,163) and a BOTTOM todo's checkbox (~535,520+). Toggle→toggle and
// the filter bar are short, and filters reflow the list (moving targets), so we
// avoid them: a stable "input ↔ bottom checkbox" axis exercises the cursor-centered
// hold-zoom honestly (push-in on a far jump → click AT the held zoom, cursor
// centered; a short adjacent hop pans without re-zooming), interleaved with one
// short hop for no-zoom contrast. The camera pulls out only on a far jump / the end.
export const TODOMVC_SCRIPT: Script = {
  loginGated: false,
  notes: "M0 mechanism check: real-time capture, ease cursor, cursor-centered hold-zoom.",
  actions: [
    // Build a 6-item list — same input, so 2–6 are zero-distance (type only, no
    // zoom). Todo 1 is a short glide from center (248px < 360 → no zoom).
    { kind: "type", selector: ".new-todo", text: "Design the landing page", submit: true },
    { kind: "type", selector: ".new-todo", text: "Record the demo video", submit: true },
    { kind: "type", selector: ".new-todo", text: "Connect the database", submit: true },
    { kind: "type", selector: ".new-todo", text: "Polish the empty state", submit: true },
    { kind: "type", selector: ".new-todo", text: "Write the release notes", submit: true },
    { kind: "type", selector: ".new-todo", text: "Ship to production", submit: true },
    // input → bottom checkbox (442px) → push IN (enter region); click #6 at zoom.
    { kind: "click", selector: ".todo-list li:nth-child(6) .toggle", label: "complete #6 (zoom)" },
    // bottom → adjacent checkbox (58px) → PAN, hold zoom (cursor stays centered).
    { kind: "click", selector: ".todo-list li:nth-child(5) .toggle", label: "complete #5 (pan)" },
    // back up to the input (~405px) → PAN at held zoom; type the 7th todo in close-up.
    { kind: "type", selector: ".new-todo", text: "Tell a friend", submit: true, label: "add #7 (pan)" },
    // input → new bottom checkbox (490px) → region change: pull out → push back in.
    { kind: "click", selector: ".todo-list li:nth-child(7) .toggle", label: "complete #7 (re-zoom)" },
  ],
};
