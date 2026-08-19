// CLI entry for one-off runs (dev / dry-run verification). The pipeline itself
// lives in pipeline.ts; source branching + E2B build in job.ts; the DB queue
// consumer in worker.ts.
//
//   Live URL (M1-style, read-only):
//     npx -y tsx local-runner/index.ts <url> [--project manual-m1] [--policy read-only|full] [--upload]
//
//   Built source (M2 — E2B builds/serves, local records the sandbox URL):
//     npx -y tsx local-runner/index.ts --type github --value https://github.com/o/r [--project manual-m2] [--upload]
//     npx -y tsx local-runner/index.ts --type zip    --value <storage-prefix>      [--project manual-m2] [--upload]
//
//   Queue worker (Vercel must run with DEMO_RUNNER=local):
//     npx -y tsx local-runner/worker.ts
//
// manual-* projectIds are dry-runs: upload lands under _test/ and the DB is never
// touched. --policy overrides the automatic gate — operator's own call, CLI only.
import { readFileSync } from "node:fs";
import { runJob } from "./job";
import type { SafetyPolicy, SourceType } from "./safety";
import { normalizeDemoScript, type DemoScript } from "../lib/demoScript";

const argv = process.argv.slice(2);
const flag = (name: string, dflt?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};

const positionalUrl = argv.find((a) => !a.startsWith("--") && a !== flag("project") && a !== flag("policy") && a !== flag("type") && a !== flag("value") && a !== flag("hint") && a !== flag("access-url") && a !== flag("access-params") && a !== flag("access-note") && a !== flag("alt-url") && a !== flag("script-file"));
const typeFlag = flag("type");
const valueFlag = flag("value");

let sourceType: SourceType;
let sourceValue: string;
if (typeFlag) {
  if (typeFlag !== "github" && typeFlag !== "zip" && typeFlag !== "live_url") {
    console.error(`--type must be github|zip|live_url, got '${typeFlag}'`);
    process.exit(1);
  }
  if (!valueFlag) {
    console.error("--type requires --value <repo-url | storage-prefix | url>");
    process.exit(1);
  }
  sourceType = typeFlag;
  sourceValue = valueFlag;
} else if (positionalUrl) {
  sourceType = "live_url";
  sourceValue = positionalUrl;
} else {
  console.error(
    "usage: tsx local-runner/index.ts <url> [--project <id>] [--policy read-only|full] [--upload] [--hint <core-feature>] [--script-file <shot.json>] [--alt-url <2nd candidate>]\n" +
      "       tsx local-runner/index.ts --type github|zip|live_url --value <v> [--project <id>] [--upload] [--hint <core-feature>]",
  );
  process.exit(1);
}

const projectId = flag("project", "manual-m1")!;
const policyFlag = flag("policy");
const policyOverride: SafetyPolicy | undefined =
  policyFlag === "full" ? "full" : policyFlag === "read-only" ? "read-only" : undefined;
const doUpload = argv.includes("--upload");
// Creator core-feature hint (변형① dry-runs): --hint "캔버스에 그림을 그리는 앱"
const userHint = flag("hint");
// 촬영 대본 dry-run: --script-file shot.json (형식=lib/demoScript.ts, 인제스트와
// 같은 정규화를 태워 큐 경로와 동일한 값이 브리핑에 들어가게 한다).
const scriptFile = flag("script-file");
let demoScript: DemoScript | undefined;
if (scriptFile) {
  const raw = JSON.parse(readFileSync(scriptFile, "utf8")) as unknown;
  demoScript = normalizeDemoScript(raw) ?? undefined;
  if (!demoScript) {
    console.error(`--script-file ${scriptFile}: no valid steps survived normalization`);
    process.exit(1);
  }
  console.log(`[cli] shot list loaded: ${demoScript.steps.length} steps` +
    (demoScript.skip?.length ? `, skip ${demoScript.skip.length}` : ""));
}
// Demo-access dry-runs (Connect 요청2): --access-url "/demo" --access-params "guest=1&lang=ko"
// --access-note "상단 '둘러보기'를 누르면 샘플 데이터가 뜬다"
const accessUrl = flag("access-url");
const accessParams = flag("access-params");
const accessNote = flag("access-note");
// 촬영 전 정찰 dry-run(피드백 B-4): --alt-url https://.../app 을 주면 두 후보를
// 한 장씩 훑어 촬영할 쪽을 고른다. NF_FAKE_SCOUT=0|1 로 무과금 강제 선택 가능.
const altUrl = flag("alt-url");
const demoAccess =
  accessUrl || accessParams || accessNote || altUrl
    ? {
        url: accessUrl,
        altUrl,
        params: accessParams
          ? Object.fromEntries(new URLSearchParams(accessParams).entries())
          : undefined,
        note: accessNote,
      }
    : undefined;

const outcome = await runJob({
  projectId,
  sourceType,
  sourceValue,
  upload: doUpload,
  userHint,
  demoScript,
  demoAccess,
  policyOverride,
  // CLI = the operator pointing the recorder at their own machine on purpose
  // (fixtures, dev servers). Queue jobs never get this.
  allowPrivateHost: true,
});
if (outcome.status === "login-gated") process.exit(0);
if (outcome.status === "moderation-held") {
  // CLI runs are operator-driven — report the verdict and stop; DB parking is
  // the queue worker's job (a real project reached here only via --project).
  console.log(
    `[cli] moderation flagged [${outcome.categories.join(", ")}]: ${outcome.reason}` +
      (outcome.quarantine ? `\n[cli] quarantined at ${outcome.quarantine.videoKey}` : ""),
  );
  process.exit(0);
}
