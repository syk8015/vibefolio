import { getToken, getOrigin } from "./config.js";
import { buildPublishPayload, detectBuildDir } from "./publish.js";
import { formatAccepted } from "./echo.js";

// `nookframe check` — 발행 전 사전 검사(2026-09-16 사용자 확정: **서버 드라이런**).
//
// 왜 서버에 물어보나: 발행을 거절하는 규칙(대본 4스텝·실속 3스텝·소개글 2~3줄 52칸·
// targetDevice·demoAccess·예상 필름 길이)은 전부 서버 lib에 있고, cli/는 레포 코드를
// import할 수 없다(독립 배포 패키지). CLI에 다시 구현하면 같은 상수의 사본이 셋이 되어
// 서버와 답이 갈라진다 — 그래서 같은 라우트에 `?dryRun=1`로 물어보고 판정만 받는다.
// 아무것도 저장되지 않고, 발행 레이트리밋(20/h)도 쓰지 않는다(검사 버킷 60/h).
//
// 검사하지 못하는 것: 파일 자체(zip 안전성·미디어 매직바이트)와 초안 개수 상한.

/** 올릴 파일이 있다는 **선언**만 payload에 싣는다 — 실제 발행과 같은 게이트 답을 받으려면 이게 필요하다. */
export function declareUploads(payload, { dir, screenshot, video } = {}) {
  const uploads = Array.isArray(payload.uploads) ? [...payload.uploads] : [];
  // bundle 선언은 "URL 없이 폴더만 올리는 발행"이 아티팩트 게이트를 통과하는 근거이고,
  // video 선언은 대본·로그인 게이트의 유일한 면제 조건이다(자동 촬영을 건너뛰므로).
  if (dir && !uploads.includes("bundle")) uploads.push("bundle");
  if (video && !uploads.includes("video")) uploads.push("video");
  if (screenshot && !uploads.includes("screenshot")) uploads.push("screenshot");
  if (uploads.length) payload.uploads = uploads;
  return uploads;
}

/** 드라이런 1회. 거절(400)도 정상 결과라 throw하지 않고 상태·본문을 그대로 돌려준다. */
export async function runDryRun({ payload, token, origin }) {
  if (!token) {
    throw new Error(
      "No token. Create one at nookframe.com/dashboard -> Connect tab, then set the `NOOKFRAME_TOKEN` env var or run `npx nookframe login <code>`.",
    );
  }
  const res = await fetch(`${(origin || getOrigin()).replace(/\/$/, "")}/api/ingest?dryRun=1`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/** 통과한 드라이런 결과 → 사람·AI가 같이 읽는 줄들. CLI와 MCP 툴이 공용으로 쓴다. */
export function formatDryRun(body, uploads = []) {
  const lines = ["✓ This payload would be accepted — nothing was uploaded."];
  lines.push(
    body.wouldUpdate
      ? `  Publishing it would UPDATE the draft already there (${body.draftId}). Pass --new (payload newDraft) to keep that one and create a second draft instead.`
      : "  Publishing it would create a NEW draft.",
  );
  for (const line of formatAccepted(body.accepted)) lines.push(line);
  if (uploads.length) {
    lines.push(`  Not checked here: the files themselves (${uploads.join(", ")}) — those are validated when you publish.`);
  }
  return lines;
}

// `nookframe check` CLI 명령. 입력은 publish와 **같은 조립**(--file·표준입력·--json + 플래그).
export async function checkCommand(args) {
  const token = getToken();
  const origin = args.origin || getOrigin();
  const { payload, jsonDir, jsonScreenshot, jsonVideo } = await buildPublishPayload(args);

  const dir = typeof args.dir === "string" ? args.dir : jsonDir;
  const video = typeof args.video === "string" ? args.video : jsonVideo;
  const screenshot = typeof args.screenshot === "string" ? args.screenshot : jsonScreenshot;
  // URL도 --dir도 없으면 publish는 빌드 폴더를 자동으로 찾아 올린다 — 검사도 같은 판단을
  // 해야 답이 같다(안 하면 여기선 "아티팩트 없음"이라 거절, 발행은 성공하는 엇갈림이 난다).
  const bundle = dir || (!payload.deployUrl && !payload.appUrl ? detectBuildDir() : null);
  const uploads = declareUploads(payload, { dir: bundle, screenshot, video });

  const { status, body } = await runDryRun({ payload, token, origin });

  if (status !== 200 || !body?.ok) {
    console.error(`✗ This payload would be REJECTED (HTTP ${status}${body?.code ? ` ${body.code}` : ""}):\n`);
    console.error(`  ${body?.error || "(the server sent no message)"}`);
    console.error("\nNothing was uploaded. Fix the payload and run check again.");
    process.exitCode = 1;
    return;
  }
  // 이 서버가 드라이런을 모르면(옛 배포에 --origin으로 붙은 경우) 검사가 아니라 **발행**이
  // 됐다는 뜻이다. 조용히 통과로 보고하면 초안이 생긴 걸 아무도 모른다.
  if (!body.dryRun) {
    console.log("⚠ This server does not support check (dry run), so the payload was PUBLISHED as a draft instead.");
    if (body.projectId) {
      console.log(`  Draft id: ${body.projectId} — delete it with: npx nookframe drafts delete ${body.projectId}`);
    }
    process.exitCode = 1;
    return;
  }
  for (const line of formatDryRun(body, uploads)) console.log(line);
  console.log("\n  Publish for real: npx nookframe publish --file <the same file>");
}
