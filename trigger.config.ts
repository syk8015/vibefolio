import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  runtime: "node",
  logLevel: "log",
  maxDuration: 1800,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      factor: 2,
      minTimeoutInMs: 2000,
      maxTimeoutInMs: 30000,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
});
