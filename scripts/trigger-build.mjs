import { tasks } from "@trigger.dev/sdk";

const sourceValue = process.argv[2];
if (!sourceValue) {
  console.error("Usage: node scripts/trigger-build.mjs <github-url>");
  process.exit(1);
}

const handle = await tasks.trigger("build-and-record", {
  projectId: `manual-${Date.now()}`,
  sourceType: "github",
  sourceValue,
});

console.log("Triggered:", handle.id);
console.log("Watch dashboard or the trigger:dev worker logs.");
