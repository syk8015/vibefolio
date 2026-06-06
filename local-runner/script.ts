// Script data contract (plan §6.1). A Script is a "full path from the initial
// screen" — for M0 (TodoMVC) it is hand-written; from M1 on, explore.ts produces
// it from a read-only computer-use pass. Selectors should be stable
// (data-testid > role+name > stable text > short CSS); replay.ts recomputes live
// positions from them each frame so moving/relaid-out elements still work.
// `x`/`y` are the logical-px coordinates the action was observed at during explore
// (same 1280×720 space replay records in). Selector is primary — replay recomputes
// the live position from it each frame — but a coordinate fallback keeps replay
// robust when an explore-derived selector doesn't resolve on the reset page.
export type ScriptAction =
  | { kind: "click"; selector: string; x?: number; y?: number; label?: string }
  | { kind: "type"; selector: string; text: string; submit?: boolean; x?: number; y?: number; label?: string }
  | { kind: "scroll"; dy: number }
  // M1 (explore) emits these; replay handles them then.
  | { kind: "hover"; selector: string; x?: number; y?: number }
  | { kind: "dismiss"; selector: string };

export type Script = {
  actions: ScriptAction[];
  loginGated: boolean;
  notes?: string;
};

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
