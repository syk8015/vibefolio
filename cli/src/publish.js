import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { getToken, getOrigin } from "./config.js";
import { zipDir } from "./zip.js";
import { formatAccepted } from "./echo.js";
import { readJsonObject } from "./jsonInput.js";

const BUILD_DIRS = ["dist", "out", "build", "public"];

// CLI와 MCP가 공유하는 인제스트 코어. payload(제목·설명 등) + (dir zip | deployUrl) 중
// 하나로 POST /api/ingest. screenshotPath/videoPath(제작자 미디어 — 이미지≤5MB·
// 영상≤20MB, 영상을 주면 발행 시 자동 촬영 생략)가 있으면 multipart로 동봉.
// 성공 시 { projectId, reviewUrl } 반환, 실패 시 throw.
export async function runPublish({ payload = {}, dir = null, screenshotPath = null, videoPath = null, token, origin }) {
  if (!token) {
    throw new Error(
      "No token. Create one at nookframe.com/dashboard -> Connect tab, then set the `NOOKFRAME_TOKEN` env var or run `npx nookframe login <token>`.",
    );
  }
  const endpoint = `${origin.replace(/\/$/, "")}/api/ingest`;

  const entryUrl = payload.appUrl || payload.deployUrl;
  if (!payload.title) {
    payload.title = dir ? basename(dir) : entryUrl ? safeHost(entryUrl) : "Untitled";
  }

  // htmlBody(채팅창 AI가 글자로 넘긴 단일 HTML)도 올릴 거리다 — 서버가 index.html 하나짜리
  // zip으로 바꾼다. 0.1.17까지 이 검사가 htmlBody를 몰라서 check는 통과하는데 publish가
  // 서버를 부르기도 전에 멈췄다(2026-09-22 실측).
  if (!dir && !entryUrl && !payload.htmlBody) {
    throw new Error("Nothing to upload — pass a deployed URL with --url, a static build with --dir, or htmlBody in the JSON.");
  }

  const authJson = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 파일 없음 → 예전과 같은 단발 JSON POST.
  if (!dir && !screenshotPath && !videoPath) {
    const res = await fetch(endpoint, { method: "POST", headers: authJson, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Upload failed (HTTP ${res.status})`);
    return body;
  }

  // 파일 있음 → 서명 URL 2단계. Vercel 함수 본문 상한(~4.5MB) 때문에 zip/영상을
  // 서버로 직접 보내지 않고, 선언(uploads) → 발급된 URL로 스토리지에 직접 PUT →
  // finalize(검증·연결) 순서로 간다.
  const uploads = [];
  if (dir) uploads.push("bundle");
  if (screenshotPath) uploads.push("screenshot");
  if (videoPath) uploads.push("video");

  const step1 = await fetch(endpoint, {
    method: "POST",
    headers: authJson,
    body: JSON.stringify({ ...payload, uploads }),
  });
  const body1 = await step1.json().catch(() => ({}));
  if (!step1.ok) throw new Error(body1.error || `Could not start the upload (HTTP ${step1.status})`);

  const files = {
    bundle: dir ? await zipDir(dir) : null,
    screenshot: screenshotPath ? await readFile(screenshotPath) : null,
    video: videoPath ? await readFile(videoPath) : null,
  };
  for (const kind of uploads) {
    const url = body1.uploads?.[kind];
    if (!url) throw new Error(`The server did not return an upload URL for ${kind}.`);
    const put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: files[kind],
    });
    if (!put.ok) throw new Error(`Failed to upload ${kind} (HTTP ${put.status})`);
  }

  const fin = await fetch(body1.finalizeUrl || `${origin.replace(/\/$/, "")}/api/ingest/finalize`, {
    method: "POST",
    headers: authJson,
    body: JSON.stringify({ projectId: body1.projectId }),
  });
  const body2 = await fin.json().catch(() => ({}));
  if (!fin.ok) throw new Error(body2.error || `Could not finalize the upload (HTTP ${fin.status})`);
  // 저장 내용 에코(C-1)는 1단계(=메타데이터를 받은 쪽)가 만든다. finalize는 파일만
  // 연결하므로 그 결과에 없으면 1단계 것을 그대로 이어붙여야 사라지지 않는다.
  // upserted도 1단계 응답에만 있다 — 빠뜨리면 기존 초안 갱신을 "새로 올렸다"고 보고한다.
  return {
    ...body2,
    accepted: body2.accepted ?? body1.accepted,
    ...(body1.upserted ? { upserted: true } : {}),
  };
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "Untitled";
  }
}

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// 로컬 경로: 플래그가 있으면 그것, 없으면 JSON의 값(MCP 스키마와 같은 dir·screenshot·video).
// 플래그만 쓰고 경로를 빠뜨리면(--dir 다음이 비어 있음) 빌드 폴더 자동 탐색으로 조용히 새지 않게 막는다.
function localPath(name, flag, fromJson) {
  if (flag === true) throw new Error(`--${name} needs a path.`);
  if (typeof flag === "string") return resolve(flag);
  return typeof fromJson === "string" && fromJson.trim() ? resolve(fromJson) : null;
}

/**
 * payload JSON(--file·표준입력·--json) 위에 플래그를 덮는다 — 명령줄에 직접 쓴 값이 이긴다.
 * publish와 check(사전 검사)가 **같은 payload**를 만들어야 답이 같으므로 조립은 여기 한 곳이다.
 * 로컬 경로 셋(dir·screenshot·video)은 서버로 보내지 않고 호출부에 돌려준다.
 */
export async function buildPublishPayload(args) {
  let payload = (await readJsonObject(args)) ?? {};
  // 서버는 { "payload": {...} } 봉투도 받는다. 여기서도 풀어야 아래 플래그 병합·URL 확인이 맞는다.
  if (Object.keys(payload).length === 1 && isObject(payload.payload)) payload = payload.payload;
  // `nookframe schema`(= MCP publish_to_nookframe 입력)와 같은 JSON을 그대로 받는다 — 로컬 경로
  // 필드는 서버로 보내지 않고 여기서 쓴다(MCP 핸들러와 같은 분리).
  const { dir: jsonDir, screenshot: jsonScreenshot, video: jsonVideo, ...fields } = payload;
  payload = fields;
  if (args.title) payload.title = args.title;
  if (args.description) payload.description = args.description;
  if (args.note) payload.builderNote = args.note;
  if (args.hint) payload.demoHighlights = args.hint;
  if (args.url) payload.deployUrl = args.url;
  if (args["app-url"]) payload.appUrl = args["app-url"];
  // 갱신할 초안(2026-09-15) — URL 대신 이 id로 찾는다. 파일 업로드 초안·URL을 바꾼 초안도
  // 중복 없이 교체된다(서버 /api/ingest의 draftId).
  if (args.id !== undefined) {
    if (typeof args.id !== "string" || !args.id.trim()) {
      throw new Error("--id needs a draft id (list them with: nookframe drafts).");
    }
    payload.draftId = args.id.trim();
  }
  // 별도 생성(2026-09-16) — 같은 URL이면 기존 초안을 덮어쓰는 게 기본이라, 앞 초안을 남기고
  // 새로 올리려면 이 플래그가 필요하다(서버 newDraft).
  if (args.new !== undefined) {
    if (payload.draftId) {
      throw new Error("--new and --id are opposites — --new always creates a new draft, --id updates that one. Use one.");
    }
    payload.newDraft = true;
  }
  // 로그인 필요 앱의 데모 모드 진입 정보 — url·params·note·impossible만(계정
  // 정보는 서버가 안 받음). impossible=게스트 경로가 원천 불가능한 앱 선언(B-3).
  if (
    args["access-url"] || args["access-params"] || args["access-note"] ||
    args["access-impossible"] || args["access-no-login"]
  ) {
    const access = { ...(payload.demoAccess || {}) };
    if (args["access-url"]) access.url = args["access-url"];
    if (args["access-params"]) {
      access.params = Object.fromEntries(new URLSearchParams(args["access-params"]).entries());
    }
    if (args["access-note"]) access.note = args["access-note"];
    if (args["access-impossible"]) access.impossible = true;
    // 로그인이 아예 필요 없다는 선언. 서버는 셋 중 하나(url·impossible·noLogin)를
    // 요구하므로, 공개 앱이라도 이 플래그로 "확인했다"를 남겨야 발행된다.
    if (args["access-no-login"]) access.noLogin = true;
    payload.demoAccess = access;
  }
  return { payload, jsonDir, jsonScreenshot, jsonVideo };
}

/** URL도 --dir도 없을 때 올릴 빌드 폴더 자동 탐색(dist·out·build·public). 없으면 null. */
export function detectBuildDir() {
  for (const d of BUILD_DIRS) {
    const p = resolve(d);
    if (existsSync(join(p, "index.html"))) return p;
  }
  return null;
}

// `nookframe publish` CLI 명령. 플래그 → payload 조립 + 아티팩트 결정 + 진행 출력.
export async function publishCommand(args) {
  const token = getToken();
  const origin = args.origin || getOrigin();
  const { payload, jsonDir, jsonScreenshot, jsonVideo } = await buildPublishPayload(args);

  // 아티팩트: --dir(또는 JSON의 dir) 명시 > URL 있음 > 자동으로 빌드 디렉터리 탐색.
  let dir = localPath("dir", args.dir, jsonDir);
  if (dir && !existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }
  if (!dir && !payload.deployUrl && !payload.appUrl) dir = detectBuildDir();

  // 제작자 미디어(요청1): 이미지≤5MB(png/jpg/webp/gif)·영상≤20MB(mp4/webm),
  // 검증은 서버(매직바이트)가 한다. 영상을 주면 발행 시 자동 촬영이 생략된다.
  const screenshotPath = localPath("screenshot", args.screenshot, jsonScreenshot);
  const videoPath = localPath("video", args.video, jsonVideo);
  if (screenshotPath && !existsSync(screenshotPath)) {
    throw new Error(`Screenshot file not found: ${screenshotPath}`);
  }
  if (videoPath && !existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const shownUrl = payload.appUrl || payload.deployUrl;
  if (dir) console.log(`📦 Zipping and uploading ${dir}…`);
  else if (shownUrl) console.log(`🔗 Registering ${shownUrl}…`);
  if (screenshotPath || videoPath) {
    console.log(`🖼️ Attaching media: ${[screenshotPath, videoPath].filter(Boolean).map((p) => basename(p)).join(", ")}`);
  }

  const body = await runPublish({ payload, dir, screenshotPath, videoPath, token, origin });
  console.log(payload.draftId
    ? `\n✓ Updated draft ${body.projectId ?? payload.draftId}.`
    : body.upserted
      ? "\n✓ Updated the existing draft with the same URL."
      : "\n✓ Uploaded to Nookframe as a draft.");
  for (const line of formatAccepted(body.accepted)) console.log(line);
  console.log(`\n  Review and publish: ${body.reviewUrl}`);
  // 다음 수정이 중복 초안을 만들지 않게 id와 방법을 같이 알려준다 — 파일 업로드 초안은 URL로 못 찾는다.
  if (body.projectId) {
    console.log(`  Draft id: ${body.projectId} — to change this draft later (files or URL included): publish --id ${body.projectId}`);
  }
}
