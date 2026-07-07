# Auto-demo interaction fixtures

Canonical test targets for the recorder (computer-use `explore` → `replay` →
camera). Instead of pointing the pipeline at random live sites, we run it against
these controlled apps so each recording tells us something specific — and so one
`explore` fee (~$0.13) buys maximum coverage.

Drag/draw are implemented with **pointer events** (`mousedown`→`mousemove`→
`mouseup`), NOT HTML5 drag-and-drop, so the recorder's synthetic mouse actually
moves things. Every interactive element has a stable `data-testid`. Both files are
fully self-contained (no network, no build) so they load instantly over localhost.
Sanity-checked with synthetic mouse events (all interactions respond).

## Files

### `nookgym.html` — consolidated coverage + storytelling
A fake task studio. One `explore` pass should exercise the whole matrix:

| Interaction | Where |
|---|---|
| click | nav rail, buttons, cards, custom dropdown |
| toggle | Dark-mode switch |
| type + live search | Capture input (filters cards; Enter adds one) |
| **drag — reorder** | Organize kanban (drag cards across columns) |
| **drag — slider** | Focus: Focus-length / Priority ranges |
| native `<select>` | Focus: "Sort by" |
| custom dropdown | Focus: "Theme accent" |
| modal + dismiss | Click a card → detail modal → Close / click-outside |
| hover tooltip | Review stat cards |
| scroll reveal | Review stats animate in on scroll |

The left rail numbers an intended tour order (**1 Capture → 2 Organize → 3 Focus →
4 Review**). That is the *storytelling* probe: does `explore` demo the app as a
coherent sequence, or jump around?

### `canvas-sketch.html` — the hard case, isolated
Freehand canvas drawing: a drawing is a **continuous pointer path**, but the
Script models a drag as one start→end vector — so this is where computer-use is
expected to struggle. Kept separate so a derailed run here can't tank the main
coverage test. Also has color swatches (click) + a brush-size slider (drag).

## Run one through the recorder

```sh
# 1. Serve the fixtures (leave running)
npm run demo:fixtures                     # -> http://localhost:5050

# 2. Record. --policy full unlocks interaction (live_url defaults to read-only,
#    which is right for real sites; these are our own controlled localhost apps).
#    --project manual-* = dry run: no DB write, no upload.
npx -y tsx local-runner/index.ts http://localhost:5050/nookgym.html \
  --project manual-nookgym --policy full

npx -y tsx local-runner/index.ts http://localhost:5050/canvas-sketch.html \
  --project manual-canvas --policy full
```

Output (mp4 + contact sheet + report) lands in the runner's `OUT_DIR`. Each run
costs one `explore` fee; the DB worker is unrelated (keep it off).

## What to judge

1. **Coverage** — does the emitted Script include each action kind the page
   affords (click / type / scroll / hover / drag)? Missing kinds = a gap.
2. **Storytelling** — did it move through the app in a sensible order (roughly the
   1→4 rail), producing a demo that reads as a narrative?
3. **Render** — in the mp4, is each interaction legible: cursor on target, camera
   framing the action, drag/slider/draw visibly moving?
