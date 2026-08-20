import { Template } from "e2b";

const NODE_VERSION = "22.12.0";

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
  ])
  .setUser("root")
  .runCmd(
    `mkdir -p /opt/node && curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz ` +
      `| tar -xJ -C /opt/node --strip-components=1`,
  )
  .setEnvs({
    PATH: "/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    PLAYWRIGHT_BROWSERS_PATH: "/opt/playwright",
  })
  // ttyd: terminal-as-a-webpage for the CLI demo path (build.ts serveTerminal) —
  // pinned static binary; the Debian/Ubuntu package availability varies by base.
  .runCmd(
    "curl -fsSL https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 " +
      "-o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd && /usr/local/bin/ttyd --version",
  )
  .runCmd("node -v && npm -v && git --version")
  .runCmd("npm i -g playwright@1.50.0")
  .runCmd("playwright install --with-deps chromium")
  .setUser("user");
