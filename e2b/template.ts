import { Template } from "e2b";

const NODE_VERSION = "22.12.0";
const FLUTTER_VERSION = "3.47.1";

export const template = Template()
  .fromBaseImage()
  // matchbox-window-manager: a minimal WM is required for headed Chromium under
  // Xvfb to map/paint its window — without a WM Chromium treats the window as
  // hidden and skips rendering (blank capture). x11-utils is for diagnostics.
  .aptInstall([
    "git",
    "curl",
    "ca-certificates",
    "xz-utils",
    "ffmpeg",
    "xvfb",
    "matchbox-window-manager",
    "x11-utils",
    // Python web apps (Streamlit/Gradio/Flask/FastAPI) build path — the base
    // image ships python3 but not pip/venv, and build.ts creates a venv per job.
    "python3",
    "python3-pip",
    "python3-venv",
    // Flutter's linux toolchain prerequisites (web target only — no Android SDK):
    // the SDK unpacks archives on first run and `flutter build web` shells out to
    // unzip/zip for its asset step.
    "unzip",
    "zip",
  ])
  .setUser("root")
  .runCmd(
    `mkdir -p /opt/node && curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz ` +
      `| tar -xJ -C /opt/node --strip-components=1`,
  )
  .setEnvs({
    PATH: "/opt/node/bin:/opt/flutter/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    PLAYWRIGHT_BROWSERS_PATH: "/opt/playwright",
  })
  // ttyd: terminal-as-a-webpage for the CLI demo path (build.ts serveTerminal) —
  // pinned static binary; the Debian/Ubuntu package availability varies by base.
  .runCmd(
    "curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 " +
      "-o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd && /usr/local/bin/ttyd --version",
  )
  // Flutter SDK (2026-08-26, 유형 커버리지 ②): cross-platform phone apps have no
  // browser face of their own, but Flutter ships a first-party web target — so a
  // Flutter source repo becomes a real, interactive web build we can film. Pinned
  // release tarball (same reasoning as ttyd: distro packages drift). Web-only:
  // precache pulls the web SDK artifacts alone, no Android/iOS toolchain.
  // `flutter build web` runs as the unprivileged `user`, and the SDK writes into
  // its own bin/cache at runtime — hence the chown + git safe.directory.
  .runCmd(
    `mkdir -p /opt && curl -fsSL https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz ` +
      "| tar -xJ -C /opt && " +
      "git config --system --add safe.directory /opt/flutter && " +
      "/opt/flutter/bin/flutter config --no-analytics --enable-web && " +
      "/opt/flutter/bin/flutter precache --web --no-android --no-ios && " +
      "chown -R user:user /opt/flutter && /opt/flutter/bin/flutter --version",
  )
  .runCmd("node -v && npm -v && git --version")
  .runCmd("npm i -g playwright@1.50.0")
  .runCmd("playwright install --with-deps chromium")
  .setUser("user");
