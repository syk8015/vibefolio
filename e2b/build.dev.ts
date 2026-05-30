import { Template, defaultBuildLogger } from "e2b";
import { template } from "./template";

async function main() {
  const info = await Template.build(template, "nookframe-builder", {
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log("Built template:", info);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
