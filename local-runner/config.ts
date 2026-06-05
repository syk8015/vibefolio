// Static configuration for the local (M5) recording worker.
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
export const MAX_VIDEO_SEC = 30;

// Supabase Storage bucket for demo videos (same bucket the E2B path writes to).
export const DEMO_BUCKET = "project-files";
