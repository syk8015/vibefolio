// Static configuration for the local (M5) recording worker.
//
// Loads .env.local once at import time (Node ≥20.12 ships process.loadEnvFile).
// Resolved from this file's location, not cwd, so the worker runs from anywhere.
// Harmless for M0 (which needs no keys); M1+ reads ANTHROPIC_API_KEY / Supabase
// service-role from here. Lazy reads (inside functions) are still preferred for
// keys so import-order can never strand a value.
//
// Hardware facts verified on this machine (2026-06-06):
//   - Apple M5 / 16GB / macOS 26.4.1
//   - Built-in Liquid Retina, scaled "looks like" 1470×956, NATIVE 2x.
//   - avfoundation "Capture screen 0" => device index 2, captures the full
//     backing store (2940×1912 px = 2× the 1470×956 logical screen).
//   - DPR is therefore 2; crop math must convert logical→capture px by ×DPR.
//     (We read the live devicePixelRatio at runtime rather than trusting this
//      constant, so a different display/scale still works — see record.ts.)
//   - ffmpeg 8.1.1 with videotoolbox (hardware H.264 encode) + libx264.
//   - System Chrome present at /Applications/Google Chrome.app => channel:"chrome".
import { fileURLToPath } from "node:url";

try {
  // path arg => independent of the process working directory
  process.loadEnvFile(fileURLToPath(new URL("../.env.local", import.meta.url)));
} catch {
  // missing .env.local is fine for paths that don't need keys (M0)
}

// avfoundation video input index for the main display screen-capture device.
export const SCREEN_DEVICE_INDEX = 2;

// Canonical capture viewport (logical CSS px). The page is recorded at this size;
// camera focal coordinates and the post-zoom all live in this space (or a ×SS
// supersample of it).
//
// 1280×720 (true 16:9), NOT the E2B path's 1280×800. Two reasons:
//  1. On this M5 the menu bar (34px) + Dock cap the usable window height at ~750
//     logical; 720 fits cleanly while 800 gets clamped (and we won't mutate the
//     user's Dock setting just to record).
//  2. The shipped card is 720p 16:9 — a 1280×720 source downscales with ZERO
//     letterboxing, unlike 16:10. The camera distance threshold uses VIEW_H at
//     runtime, so nothing downstream hard-codes 800.
export const VIEW_W = 1280;
export const VIEW_H = 720;

// Where the Chrome window is parked. macOS clamps the frame top below the menu
// bar, so the real on-screen offset is read back at runtime (computeCropRect).
export const WINDOW_POSITION = { x: 0, y: 0 } as const;

// Real-time capture frame rate. Real GPU output, so this is a true 60fps grab
// (the whole reason we moved off E2B virtual time).
export const FPS = 60;

// Scratch dir for raw/intermediate/final artifacts during a job.
export const OUT_DIR = "/tmp/nf-runner";

// Hard cap on the shipped clip length (mirrors the E2B path's MAX_VIDEO_SEC).
// M0 holds a slightly higher cap so the longer mechanism-demo isn't truncated
// mid-action; trim back toward ~20–25s once the cinematic timing is judged.
export const MAX_VIDEO_SEC = 34;

// Supabase Storage bucket for demo videos (same bucket the E2B path writes to).
export const DEMO_BUCKET = "project-files";

// ── Timeline anchors (trap C) ─────────────────────────────────────────────────

// Wall-clock baseline correction: recStartTime = (Date.now() at spawn) +
// CAPTURE_WARMUP_MS is treated as the wall-clock of raw frame 0, because
// avfoundation takes a moment to produce its first frame. Camera frame indices
// derive from this, so if the post-zoom lands consistently LATE relative to the
// action, INCREASE this; if EARLY, decrease (may go negative). Tune by eyeball on
// the demo/contact-sheet.
// Measured on this M5 (wall-record − captured-duration): warmup+flush ≈ 0.32–0.39s.
// Frame-checked the crossover: at 0ms the click result appears mid-zoom (~0.5s
// early); at 330ms it lands ~0.25s after the 1x reveal. 250ms puts the click ~on
// the 1x frame (within the ±70ms run-to-run warmup jitter), so the result is
// revealed at fullscreen as specced.
export const CAPTURE_WARMUP_MS = 250;

// Intro: record the main page for a beat before any interaction (hero impression).
// Happens AFTER recording starts, so every camera event is naturally offset by it.
export const INTRO_MS = 3000;

// Tail: hold the final state at 1x before stopping the recording.
export const TAIL_MS = 1100;

// ── Explore (M1) ────────────────────────────────────────────────────────────────

// Computer-use model. 4.6/4.8 don't expose the computer tool yet; the latest
// computer-use-capable Sonnet is the floor here (mirrors the E2B path's MODEL).
export const EXPLORE_MODEL = process.env.DEMO_CU_MODEL || "claude-sonnet-4-5";

// Hard cap on agent turns during the read-only explore pass (cost guard). Explore
// is NOT recorded, so steps don't affect clip length — only API cost.
export const EXPLORE_MAX_STEPS = 14;

// Floor: re-prompt rather than accept a demo that touched fewer real interactions
// than this (a scroll-only / one-click pass isn't worth shipping).
export const EXPLORE_MIN_INTERACTIONS = 4;

// Bounded re-prompts when the agent ends early (too few interactions).
export const EXPLORE_MAX_REPROMPTS = 2;

// Wall-clock budget for the whole explore loop (cost + hang guard).
export const EXPLORE_MAX_MS = 4 * 60_000;
