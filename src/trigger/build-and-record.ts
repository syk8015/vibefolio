import { task, logger, retry } from "@trigger.dev/sdk";
import Sandbox from "e2b";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws";
import { RECORD_HELPER_SRC } from "./record-helper-src";
import { isR2Configured, uploadToR2, pruneR2PrefixExcept } from "../../lib/r2";

// Trigger.dev 워커는 Node 21이라 native WebSocket이 없음.
// supabase-js의 RealtimeClient가 ws를 못 잡으면 초기화에서 throw해서
// DB write 자체가 안 됨. transport로 명시 주입.
const SUPABASE_OPTS = {
  realtime: { transport: ws as unknown as never },
} as const;

// Single-quote a value so it is always exactly ONE shell argument, regardless of
// metacharacters. User-derived strings (repo URL, live URL, zip file paths) flow
// into sandbox.commands.run, which executes them via a shell; without this a value
// like `https://x/$(curl evil)` or `repo;wget…` would run command substitution /
// chained commands inside the sandbox. Embedded single quotes are closed, escaped
// and reopened ('\'') so the wrapping itself can't be broken out of.
function shQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export type BuildPayload = {
  projectId: string;
  sourceType: "github" | "zip" | "live_url";
  sourceValue: string;
};

export type BuildResult = {
  url: string;
  sandboxId?: string;
  builtAt: string;
  videoBytes?: number;
  videoUrl?: string;
};

const SANDBOX_TIMEOUT_MS = 900_000;
const CLONE_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 600_000;
const READY_TIMEOUT_MS = 90_000;
// The computer-use agent loop (screenshots + API round-trips + actions) plus
// the initial load wait can run well past two minutes — and virtual-time capture
// takes a CDP round-trip + screenshot per frame, so a full ~25s demo is slower
// than real time to capture. Give it generous room.
const RECORD_TIMEOUT_MS = 480_000;
const RECORD_DURATION_SEC = 15;
// Hard cap on the final clip length, regardless of how long the agent ran.
const MAX_VIDEO_SEC = 30;
// Virtual X display for headed capture. Height = 800 content + ~87 Chromium
// toolbar; the recorder grabs only the content region below the toolbar.
const DISPLAY_NUM = ":99";
const DISPLAY_W = 1280;
const DISPLAY_H = 887;
// The recorder captures the 1280×800 viewport (VIEW_W/H in record-helper-src) and
// assembles cap.mp4 at that size; the post-zoom focal coordinates live in this
// space, so buildZoomFilter operates on these dimensions before the 720p scale.
const CAP_W = 1280;
const CAP_H = 800;
const DEV_PORT = 3000;
const NODE_PATH_PREFIX = "export PATH=/opt/node/bin:$PATH && ";
const RECORD_PREFIX =
  NODE_PATH_PREFIX +
  "export NODE_PATH=/usr/local/lib/node_modules && " +
  "export PLAYWRIGHT_BROWSERS_PATH=/opt/playwright && ";
const DEMO_BUCKET = "project-files";

// supabase storage list는 한 단계만 본다. zip 업로드는 중첩 디렉터리(src/,
// public/, ...)를 가질 수 있어서 BFS로 모든 파일 경로를 모은다.
async function listStorageFilesRecursive(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [prefix];
  while (queue.length) {
    const dir = queue.shift()!;
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(dir, { limit: 1000 });
    if (error) throw new Error(`storage list failed at ${dir}: ${error.message}`);
    for (const entry of data ?? []) {
      const full = `${dir}/${entry.name}`;
      // supabase는 디렉터리 placeholder를 id=null + metadata=null로 돌려준다.
      if (entry.id === null) {
        queue.push(full);
      } else {
        out.push(full);
      }
    }
  }
  return out;
}

async function recordFailedStatus(projectId: string, error: unknown) {
  if (projectId.startsWith("manual-")) return; // dry-run 모드는 DB 안 건드림
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      SUPABASE_OPTS,
    );
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error";
    // 너무 긴 stack trace는 잘라서 저장 (UI tooltip이 감당 가능한 길이)
    const truncated = message.length > 1000 ? message.slice(0, 1000) + "…" : message;
    await supabase
      .from("projects")
      .update({
        demo_build_status: "failed",
        demo_build_error: truncated,
      })
      .eq("id", projectId);
  } catch (writeErr) {
    logger.error("Failed to record failure status", { writeErr });
  }
}

type RecorderMeta = {
  mode?: string;
  steps?: number;
  // Meaningful (non-scroll) actions performed, and how many times the agent had
  // to be nudged to keep going / actually interact (length + interaction guards).
  interactions?: number;
  reprompts?: number;
  durationMs?: number;
  visibleChars?: number;
  cuError?: string | null;
  // Always false now (no dead-air cut under virtual time); kept so the src
  // selection below stays a no-op pointing at cap.mp4.
  tight?: boolean;
  capDurMs?: number;
  // Number of 60fps frames the recorder captured + assembled, and the fps.
  frames?: number;
  fps?: number;
  // unique (non-duplicate) frames / sec via mpdecimate ≈ genuine motion
  // smoothness (the container tag always reads 60). Static holds pull it down.
  uniqueFps?: number;
  // Camera keyframe track for the post-processed cinematic zoom (see CameraEvent).
  cameraEvents?: CameraEvent[];
};

// One keyframe of the cinematic camera: starting at frame `startFrame`, over
// `durMs`, ease the zoom from `fromZoom`→`toZoom` AND the focal point from
// (fromFocalX,fromFocalY)→(toFocalX,toFocalY) (in 1280×800 capture-frame space).
// Constant zoom with a moving focal = a PAN; constant focal with changing zoom =
// a push-in/out. Emitted by the recorder; expanded into ffmpeg zoompan by
// buildZoomFilter.
type CameraEvent = {
  startFrame: number;
  durMs: number;
  fromZoom: number;
  toZoom: number;
  fromFocalX: number;
  fromFocalY: number;
  toFocalX: number;
  toFocalY: number;
};

// The recorder prints a JSON summary as its last stdout line. Parse it (from the
// end, skipping the human-readable "goto ..." lines) so we can trim the video to
// the actual interaction window.
function parseRecorderMeta(stdout: string): RecorderMeta {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        return JSON.parse(line) as RecorderMeta;
      } catch {
        // keep scanning earlier lines
      }
    }
  }
  return {};
}

// Expand the recorder's camera keyframe events into an ffmpeg `zoompan` filter
// that applies an Apple-ad focal push-in to the FLAT capture. We do the zoom here
// in post (not in the DOM) so the page layout — fixed/sticky headers, modals — is
// never distorted, and so the zoom is a clean pixel camera move. Source is 1280×800
// and is downscaled to 720 afterwards, which (with lanczos) hides most zoompan
// sub-pixel shimmer.
//
// Math: to keep the focal point (fx,fy) fixed on screen while zooming by z, the
// crop window (iw/z × ih/z) top-left must be x=fx·(1−1/z), y=fy·(1−1/z), clamped
// to the frame. zoompan exposes `zoom` (this frame's z) and iw/ih in the x/y
// expressions, so x/y track z automatically and only the focal needs to be
// piecewise. Returns "" when there are no events (e.g. the scroll fallback).
// Exported for the expression unit test (scripts/test-zoom-filter.mts).
export function buildZoomFilter(
  events: CameraEvent[],
  fps: number,
  w: number,
  h: number,
): string {
  if (!events.length) return "";

  // Non-overlapping segments tiling the timeline. Each segment eases zoom + focal
  // from a start state to an end state (a "hold" is just start===end). zoom and
  // both focal axes are stored as [from,to] pairs so a pan (constant zoom, moving
  // focal) and a push-in (moving zoom, constant focal) use the same machinery.
  type Seg = {
    a: number;
    b: number;
    z: [number, number];
    fx: [number, number];
    fy: [number, number];
  };
  const segs: Seg[] = [];
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  let prevEnd = 0;
  let pz = 1;
  let pfx = cx;
  let pfy = cy;
  const sorted = [...events].sort((p, q) => p.startFrame - q.startFrame);
  for (const e of sorted) {
    const a = Math.max(prevEnd, Math.round(e.startFrame));
    const d = Math.max(1, Math.round((e.durMs / 1000) * fps));
    const b = a + d;
    if (a > prevEnd) {
      segs.push({ a: prevEnd, b: a, z: [pz, pz], fx: [pfx, pfx], fy: [pfy, pfy] }); // hold
    }
    segs.push({
      a,
      b,
      z: [e.fromZoom, e.toZoom],
      fx: [e.fromFocalX, e.toFocalX],
      fy: [e.fromFocalY, e.toFocalY],
    });
    prevEnd = b;
    pz = e.toZoom;
    pfx = e.toFocalX;
    pfy = e.toFocalY;
  }

  // easeInOut cubic interpolation from `from`→`to` over [a, a+dur), as an ffmpeg
  // expression. Constant when from===to (cheap, exact).
  const easeSeg = (a: number, from: number, to: number, dur: number): string => {
    if (from === to) return `${from}`;
    const P = `((on-${a})/${dur})`;
    return `(${from}+(${to - from})*(if(lt(${P},0.5),4*pow(${P},3),1-pow(-2*${P}+2,3)/2)))`;
  };

  // Nested if() over segments, built end-first so the innermost else is the default
  // (z=1, focal=center → a whole-frame no-op crop).
  let zExpr = "1";
  let fxExpr = String(cx);
  let fyExpr = String(cy);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const dur = s.b - s.a;
    const cond = `between(on,${s.a},${s.b - 1})`;
    zExpr = `if(${cond},${easeSeg(s.a, s.z[0], s.z[1], dur)},${zExpr})`;
    fxExpr = `if(${cond},${easeSeg(s.a, s.fx[0], s.fx[1], dur)},${fxExpr})`;
    fyExpr = `if(${cond},${easeSeg(s.a, s.fy[0], s.fy[1], dur)},${fyExpr})`;
  }

  // Clamp x/y so the zoom window can never reference pixels outside the frame
  // (e.g. a click in a corner) — zoompan would otherwise error / show black.
  const xExpr = `max(0,min(iw-iw/zoom,(${fxExpr})*(1-1/zoom)))`;
  const yExpr = `max(0,min(ih-ih/zoom,(${fyExpr})*(1-1/zoom)))`;

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${w}x${h}:fps=${fps}`;
}

export const buildAndRecord = task({
  id: "build-and-record",
  maxDuration: 1200,
  // Cost ceiling: each run spins up an E2B sandbox + Anthropic computer-use calls.
  // A global concurrency cap means even a flood of triggers (re-record spam, mass
  // signups) can never run more than this many paid sandboxes at once — the rest
  // queue. Pair this with the per-project debounce on the trigger side.
  queue: { name: "demo-builds", concurrencyLimit: 3 },
  catchError: async ({ payload, error, ctx }) => {
    const buildPayload = payload as BuildPayload;
    logger.error("Build job failed", {
      projectId: buildPayload.projectId,
      attempt: ctx.attempt.number,
      error: error instanceof Error ? error.message : String(error),
    });
    await recordFailedStatus(buildPayload.projectId, error);
  },
  run: async (payload: BuildPayload): Promise<BuildResult> => {
    logger.log("Build job start", { payload });

    if (
      payload.sourceType !== "github" &&
      payload.sourceType !== "live_url" &&
      payload.sourceType !== "zip"
    ) {
      throw new Error(
        `Unsupported source type '${payload.sourceType}'`,
      );
    }

    const sandbox = await Sandbox.create("nookframe-builder", {
      timeoutMs: SANDBOX_TIMEOUT_MS,
    });
    logger.log("Sandbox created", { sandboxId: sandbox.sandboxId });

    // github/zip: 샌드박스에서 빌드 + dev server. live_url: 이미 호스팅된 URL 그대로.
    let recordTarget: string;
    let sandboxPublicUrl: string | undefined;

    if (payload.sourceType === "github" || payload.sourceType === "zip") {
      const repoPath = "/tmp/app";

      if (payload.sourceType === "github") {
        const repoUrl = payload.sourceValue;
        // repoUrl is already a reconstructed clean github URL (lib/demoSource), but
        // shell-quote at the sink too so the command can never be broken out of.
        const clone = await sandbox.commands.run(
          `git clone --depth 1 ${shQuote(repoUrl)} ${shQuote(repoPath)}`,
          { timeoutMs: CLONE_TIMEOUT_MS },
        );
        logger.log("git clone done", { exitCode: clone.exitCode });
      } else {
        // zip: supabase storage prefix 아래 모든 파일을 받아 샌드박스에 펼친다.
        const supabaseDl = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          SUPABASE_OPTS,
        );
        const prefix = payload.sourceValue;
        const filePaths = await listStorageFilesRecursive(
          supabaseDl,
          DEMO_BUCKET,
          prefix,
        );
        logger.log("storage list done", { prefix, count: filePaths.length });
        if (!filePaths.length) {
          throw new Error(`No files found under storage prefix '${prefix}'`);
        }

        await sandbox.commands.run(`mkdir -p ${shQuote(repoPath)}`);
        for (const storagePath of filePaths) {
          const relative = storagePath.slice(prefix.length + 1); // strip "{prefix}/"
          // zip-slip guard: a crafted upload could carry object keys like
          // `../../etc/x`. Keep every written file strictly inside repoPath so a
          // traversal entry can't escape the build dir or clobber sandbox files.
          const segs = relative.split("/");
          if (
            !relative ||
            relative.startsWith("/") ||
            relative.includes("\\") ||
            relative.includes("\0") ||
            segs.some((s) => s === "..")
          ) {
            logger.log("skipping unsafe zip path", { relative });
            continue;
          }
          const { data, error } = await supabaseDl.storage
            .from(DEMO_BUCKET)
            .download(storagePath);
          if (error || !data) {
            throw new Error(
              `storage download failed at ${storagePath}: ${error?.message ?? "no data"}`,
            );
          }
          const targetPath = `${repoPath}/${relative}`;
          const targetDir = targetPath.substring(0, targetPath.lastIndexOf("/"));
          if (targetDir && targetDir !== repoPath) {
            await sandbox.commands.run(`mkdir -p ${shQuote(targetDir)}`);
          }
          await sandbox.files.write(targetPath, data);
        }
        logger.log("zip files uploaded to sandbox", {
          count: filePaths.length,
          repoPath,
        });
      }

      const install = await sandbox.commands.run(
        `${NODE_PATH_PREFIX}cd ${repoPath} && npm install --no-audit --no-fund --prefer-offline`,
        { timeoutMs: INSTALL_TIMEOUT_MS },
      );
      logger.log("npm install done", { exitCode: install.exitCode });

      await sandbox.commands.run(
        `${NODE_PATH_PREFIX}cd ${repoPath} && npm run dev -- --host 0.0.0.0 --port ${DEV_PORT} > /tmp/dev.log 2>&1`,
        { background: true },
      );

      sandboxPublicUrl = `https://${sandbox.getHost(DEV_PORT)}`;

      const deadline = Date.now() + READY_TIMEOUT_MS;
      let ready = false;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(sandboxPublicUrl, { signal: AbortSignal.timeout(5000) });
          if (res.status < 500) {
            ready = true;
            break;
          }
        } catch {
          // keep polling
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!ready) {
        const tail = await sandbox.commands.run("tail -80 /tmp/dev.log");
        throw new Error(
          `Dev server did not respond within ${READY_TIMEOUT_MS / 1000}s.\n--- dev.log tail ---\n${tail.stdout}`,
        );
      }

      logger.log("Dev server reachable", { url: sandboxPublicUrl });
      recordTarget = `http://localhost:${DEV_PORT}`;
    } else {
      // live_url: just record the public URL directly.
      recordTarget = payload.sourceValue;
      logger.log("Live URL mode — skipping build", { url: recordTarget });
    }

    await sandbox.files.write("/tmp/record-helper.js", RECORD_HELPER_SRC);
    logger.log("record helper uploaded");

    // Headed capture needs a virtual X display + a window manager (Chromium
    // skips rendering an unmanaged "hidden" window -> blank capture). Start both
    // in the background; the recorder launches headed Chromium on this display
    // and screen-grabs it with ffmpeg x11grab for a true 60fps recording.
    await sandbox.commands.run(
      `Xvfb ${DISPLAY_NUM} -screen 0 ${DISPLAY_W}x${DISPLAY_H}x24 -nolisten tcp >/tmp/xvfb.log 2>&1`,
      { background: true },
    );
    await new Promise((r) => setTimeout(r, 1500));
    await sandbox.commands.run(
      `DISPLAY=${DISPLAY_NUM} matchbox-window-manager -use_titlebar no >/tmp/wm.log 2>&1`,
      { background: true },
    );
    await new Promise((r) => setTimeout(r, 1000));

    // Inject the Anthropic key via `envs` (never the command string) so it
    // drives the computer-use agent loop without leaking into logs. Absent key
    // -> the recorder falls back to a plain scroll, still producing a video.
    // DISPLAY / DEMO_DISPLAY_H tell the headed recorder where to render + how far
    // down the toolbar sits so it grabs only the content region.
    const recordEnvs: Record<string, string> = {
      DISPLAY: DISPLAY_NUM,
      DEMO_DISPLAY_H: String(DISPLAY_H),
    };
    if (process.env.ANTHROPIC_API_KEY)
      recordEnvs.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (process.env.DEMO_CU_MODEL)
      recordEnvs.DEMO_CU_MODEL = process.env.DEMO_CU_MODEL;
    logger.log("recorder mode", {
      computerUse: Boolean(recordEnvs.ANTHROPIC_API_KEY),
    });

    // recordTarget is either a fixed localhost URL (github/zip) or the user's
    // live_url, which can legitimately contain shell metacharacters in its query
    // string — quote it so it reaches the recorder as a single argv, never a
    // command. The recorder validates the protocol again before navigating.
    const recordResult = await sandbox.commands.run(
      `${RECORD_PREFIX}mkdir -p /tmp/rec && node /tmp/record-helper.js ${shQuote(recordTarget)} /tmp/rec ${RECORD_DURATION_SEC}`,
      { timeoutMs: RECORD_TIMEOUT_MS, envs: recordEnvs },
    );
    logger.log("record done", {
      exitCode: recordResult.exitCode,
      stdout: recordResult.stdout,
    });
    if (recordResult.exitCode !== 0) {
      throw new Error(
        `Recorder exited ${recordResult.exitCode}: ` +
          (recordResult.stderr?.slice(-600) || recordResult.stdout?.slice(-600) || "no output"),
      );
    }

    // cap.mp4 is a constant-60fps clip the recorder assembled from per-frame
    // screenshots taken under CDP virtual time (deterministic 60fps, true app
    // speed, no dead air — virtual time is paused during the agent's API waits).
    const meta = parseRecorderMeta(recordResult.stdout);
    logger.log("recorder meta", {
      mode: meta.mode,
      steps: meta.steps,
      interactions: meta.interactions,
      reprompts: meta.reprompts,
      frames: meta.frames,
      fps: meta.fps,
      durationMs: meta.durationMs,
      capDurMs: meta.capDurMs,
      uniqueFps: meta.uniqueFps,
      cuError: meta.cuError ?? undefined,
    });

    const probe = async (f: string) =>
      parseFloat(
        (
          await sandbox.commands.run(
            `ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 /tmp/rec/${f}`,
          )
        ).stdout.trim(),
      ) || 0;
    // The recorder assembles its virtual-time frames into cap.mp4 (constant 60fps).
    const src = "cap.mp4";
    const srcDur = await probe(src);
    const clipLen = Math.max(2, Math.min(MAX_VIDEO_SEC, srcDur || RECORD_DURATION_SEC));
    const fadeOutStart = Math.max(0, clipLen - 0.5).toFixed(2);
    // Cinematic camera zoom (applied here in post, on the flat capture). Empty for
    // the scroll fallback (no events) → plain scale+fade as before.
    const camEvents = Array.isArray(meta.cameraEvents) ? meta.cameraEvents : [];
    logger.log("post-process", { src, srcDur, clipLen, camEvents: camEvents.length });
    // To kill zoompan's integer-position shimmer we SUPERSAMPLE: upscale the 1280×800
    // source ×SS first (finer sub-pixel granularity for the zoom window), run zoompan
    // at that size, then lanczos-downscale to 720p. (Focal coords scale by SS too.)
    // Re-assert constant 60fps (-r 60 -fps_mode cfr) as a belt-and-braces guarantee.
    const SS = 2;
    let vf: string;
    if (camEvents.length) {
      const ssEvents = camEvents.map((e) => ({
        ...e,
        fromFocalX: e.fromFocalX * SS,
        fromFocalY: e.fromFocalY * SS,
        toFocalX: e.toFocalX * SS,
        toFocalY: e.toFocalY * SS,
      }));
      const zoomFilter = buildZoomFilter(ssEvents, 60, CAP_W * SS, CAP_H * SS);
      vf =
        `scale=${CAP_W * SS}:${CAP_H * SS}:flags=lanczos,${zoomFilter},` +
        `scale=-2:720:flags=lanczos,` +
        `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutStart}:d=0.5`;
    } else {
      vf =
        `scale=-2:720:flags=lanczos,` +
        `fade=t=in:st=0:d=0.4,fade=t=out:st=${fadeOutStart}:d=0.5`;
    }
    const ffmpegCmd =
      `cd /tmp/rec && ffmpeg -y -i ${src} -t ${clipLen.toFixed(2)} ` +
      `-vf "${vf}" ` +
      `-r 60 -fps_mode cfr ` +
      `-c:v libx264 -preset medium -crf 26 -pix_fmt yuv420p -an ` +
      `-movflags +faststart demo.mp4`;
    const ffmpegResult = await sandbox.commands.run(ffmpegCmd, {
      timeoutMs: 120_000,
    });
    if (ffmpegResult.exitCode !== 0) {
      throw new Error(
        `ffmpeg failed (exit ${ffmpegResult.exitCode}): ${ffmpegResult.stderr.slice(-600)}`,
      );
    }
    logger.log("ffmpeg done");

    // Blank-recording guard: never ship a uniform-color video. Sample the
    // final mp4 at 2fps and read each frame's luminance spread (YMAX-YMIN).
    // A blank page (font-gated / JS-gated content, wrong default theme, dead
    // target) yields near-uniform frames; any frame with real content (text,
    // imagery) has a wide spread. We pass if *any* sampled frame looks alive.
    const SIG_PATH = "/tmp/rec/sig.txt";
    await sandbox.commands.run(
      `cd /tmp/rec && ffmpeg -y -i demo.mp4 -vf "fps=2,signalstats,metadata=print:file=${SIG_PATH}" -an -f null - 2>/dev/null`,
      { timeoutMs: 60_000 },
    );
    const sigText = await retry.onThrow(
      async () => sandbox.files.read(SIG_PATH, { format: "text" }),
      { maxAttempts: 3, minTimeoutInMs: 1000, factor: 2 },
    );
    const mins = [...sigText.matchAll(/signalstats\.YMIN=([\d.]+)/g)].map((m) =>
      parseFloat(m[1]),
    );
    const maxs = [...sigText.matchAll(/signalstats\.YMAX=([\d.]+)/g)].map((m) =>
      parseFloat(m[1]),
    );
    let peakSpread = 0;
    for (let i = 0; i < Math.min(mins.length, maxs.length); i++) {
      peakSpread = Math.max(peakSpread, maxs[i] - mins[i]);
    }
    const BLANK_SPREAD_THRESHOLD = 40;
    logger.log("blank check", {
      sampledFrames: Math.min(mins.length, maxs.length),
      peakSpread,
    });
    // Only fail when we actually got samples; if parsing yielded nothing, don't
    // block on a measurement we couldn't make.
    if (mins.length && maxs.length && peakSpread < BLANK_SPREAD_THRESHOLD) {
      throw new Error(
        `Recording appears blank — every sampled frame was near-uniform color ` +
          `(peak luminance spread ${peakSpread.toFixed(1)} < ${BLANK_SPREAD_THRESHOLD}). ` +
          `The target rendered no visible content (font-gated/JS-gated content, ` +
          `a light default theme with no painted text, or a dead page). ` +
          `Recorder diagnostics: ${recordResult.stdout.slice(-400)}`,
      );
    }

    // E2B sandbox는 file read에서 transient "fetch failed"가 30~50% 빈도. 재시도로 흡수.
    const videoBytes = await retry.onThrow(
      async () => sandbox.files.read("/tmp/rec/demo.mp4", { format: "bytes" }),
      { maxAttempts: 4, minTimeoutInMs: 1500, factor: 2 },
    );
    const buf = Buffer.from(videoBytes);
    logger.log("video downloaded", { bytes: buf.length });

    // Poster frame for the watch-page og:image (best-effort). NOTE: the cloud
    // film has no in-video endcap yet (this machine's endcap uses a headless
    // Chrome render that the sandbox path doesn't run) — the chip/end card live
    // only on the local recorder. demo.mp4 is all body here, so any frame works.
    let posterBuf: Buffer | null = null;
    try {
      const ss = Math.max(0.5, clipLen * 0.4).toFixed(2);
      const posterRes = await sandbox.commands.run(
        `cd /tmp/rec && ffmpeg -y -ss ${ss} -i demo.mp4 -frames:v 1 -q:v 3 poster.jpg`,
        { timeoutMs: 30_000 },
      );
      if (posterRes.exitCode === 0) {
        const posterBytes = await retry.onThrow(
          async () => sandbox.files.read("/tmp/rec/poster.jpg", { format: "bytes" }),
          { maxAttempts: 3, minTimeoutInMs: 1000, factor: 2 },
        );
        posterBuf = Buffer.from(posterBytes);
        logger.log("poster extracted", { bytes: posterBuf.length });
      }
    } catch (e) {
      logger.log("poster extraction failed (non-fatal)", { error: (e as Error).message });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      SUPABASE_OPTS,
    );
    const isRealProject = !payload.projectId.startsWith("manual-");

    let userId: string | null = null;
    if (isRealProject) {
      const { data, error } = await supabase
        .from("projects")
        .select("user_id")
        .eq("id", payload.projectId)
        .single();
      if (error) throw new Error(`projects select failed: ${error.message}`);
      userId = data.user_id;
    }

    const prefix = isRealProject
      ? `${userId}/${payload.projectId}/`
      : `_test/${payload.projectId}/`;

    // R2 when configured (versioned, immutable, free egress); Supabase fallback
    // on the fixed key otherwise so the pipeline works before R2 is provisioned.
    let storagePath: string;
    let publicUrl: string;
    let posterUrl: string | undefined;
    if (isR2Configured()) {
      const ts = Date.now();
      storagePath = `${prefix}demo-${ts}.mp4`;
      publicUrl = await uploadToR2(storagePath, buf, "video/mp4");
      if (posterBuf) {
        posterUrl = await uploadToR2(`${prefix}poster-${ts}.jpg`, posterBuf, "image/jpeg");
      }
      await pruneR2PrefixExcept(prefix, String(ts)).catch((e) =>
        logger.log("R2 prune failed (non-fatal)", { error: (e as Error).message }),
      );
    } else {
      storagePath = `${prefix}demo.mp4`;
      const { error: uploadErr } = await supabase.storage
        .from(DEMO_BUCKET)
        .upload(storagePath, buf, { contentType: "video/mp4", upsert: true });
      if (uploadErr)
        throw new Error(`storage upload failed: ${uploadErr.message}`);
      publicUrl = supabase.storage.from(DEMO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
      if (posterBuf) {
        const posterKey = `${prefix}poster.jpg`;
        const { error: pErr } = await supabase.storage
          .from(DEMO_BUCKET)
          .upload(posterKey, posterBuf, { contentType: "image/jpeg", upsert: true });
        if (!pErr)
          posterUrl = supabase.storage.from(DEMO_BUCKET).getPublicUrl(posterKey).data.publicUrl;
      }
    }
    logger.log("video uploaded", { storagePath, publicUrl, poster: Boolean(posterUrl) });

    if (isRealProject) {
      const { error: updErr } = await supabase
        .from("projects")
        .update({
          demo_video_url: publicUrl,
          demo_poster_url: posterUrl ?? null,
          demo_build_status: "done",
          demo_generated_at: new Date().toISOString(),
        })
        .eq("id", payload.projectId);
      if (updErr)
        throw new Error(`projects update failed: ${updErr.message}`);
      logger.log("projects updated", { projectId: payload.projectId });
    }

    return {
      url: sandboxPublicUrl ?? payload.sourceValue,
      sandboxId: sandbox.sandboxId,
      builtAt: new Date().toISOString(),
      videoBytes: buf.length,
      videoUrl: publicUrl,
    };
  },
});
