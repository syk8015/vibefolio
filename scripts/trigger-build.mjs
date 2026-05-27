import { tasks } from "@trigger.dev/sdk";

const [, , arg1, arg2] = process.argv;

if (!arg1) {
  console.error(
    "Usage:\n" +
      "  node scripts/trigger-build.mjs <github-url>\n" +
      "  node scripts/trigger-build.mjs live_url <https://...>\n" +
      "  node scripts/trigger-build.mjs github <https://github.com/...>",
  );
  process.exit(1);
}

let sourceType;
let sourceValue;
if (arg2) {
  if (arg1 !== "github" && arg1 !== "live_url") {
    console.error(`sourceType must be "github" or "live_url" (got "${arg1}")`);
    process.exit(1);
  }
  sourceType = arg1;
  sourceValue = arg2;
} else {
  sourceType = "github";
  sourceValue = arg1;
}

const projectId = `manual-${Date.now()}`;

const handle = await tasks.trigger("build-and-record", {
  projectId,
  sourceType,
  sourceValue,
});

console.log("Triggered:", handle.id);
console.log("projectId:", projectId);
console.log("sourceType:", sourceType);
console.log("sourceValue:", sourceValue);
console.log("Watch dashboard or the trigger:dev worker logs.");
