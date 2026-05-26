import { Template } from "e2b";

const NODE_VERSION = "22.12.0";

export const template = Template()
  .fromBaseImage()
  .aptInstall(["git", "curl", "ca-certificates", "xz-utils"])
  .setUser("root")
  .runCmd(
    `mkdir -p /opt/node && curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz ` +
      `| tar -xJ -C /opt/node --strip-components=1`,
  )
  .setEnvs({
    PATH: "/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  })
  .runCmd("node -v && npm -v && git --version")
  .setUser("user");
