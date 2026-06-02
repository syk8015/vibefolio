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
  .runCmd("node -v && npm -v && git --version")
  .runCmd("npm i -g playwright@1.50.0")
  .runCmd("playwright install --with-deps chromium")
  .setUser("user");
