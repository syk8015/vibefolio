import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { getToken, getOrigin } from "./config.js";
import { zipDir } from "./zip.js";

const BUILD_DIRS = ["dist", "out", "build", "public"];

// CLI와 MCP가 공유하는 인제스트 코어. payload(제목·설명 등) + (dir zip | deployUrl) 중
// 하나로 POST /api/ingest. screenshotPath/videoPath(제작자 미디어 — 이미지≤5MB·
// 영상≤20MB, 영상을 주면 발행 시 자동 촬영 생략)가 있으면 multipart로 동봉.
// 성공 시 { projectId, reviewUrl } 반환, 실패 시 throw.
export async function runPublish({ payload = {}, dir = null, screenshotPath = null, videoPath = null, token, origin }) {
  if (!token) {
    throw new Error(
      "토큰이 없어요. nookframe.com/dashboard → 연결 탭에서 발급 후 `NOOKFRAME_TOKEN` 환경변수에 넣거나 `npx nookframe login <token>` 하세요.",
    );
  }
  const endpoint = `${origin.replace(/\/$/, "")}/api/ingest`;

  const entryUrl = payload.appUrl || payload.deployUrl;
  if (!payload.title) {
    payload.title = dir ? basename(dir) : entryUrl ? safeHost(entryUrl) : "제목 없음";
  }

  if (!dir && !entryUrl) {
    throw new Error("올릴 대상이 없어요 — 배포 URL은 --url, 정적 빌드는 --dir 로 알려주세요.");
  }

  const authJson = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 파일 없음 → 예전과 같은 단발 JSON POST.
  if (!dir && !screenshotPath && !videoPath) {
    const res = await fetch(endpoint, { method: "POST", headers: authJson, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `업로드 실패 (HTTP ${res.status})`);
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
  if (!step1.ok) throw new Error(body1.error || `업로드 준비 실패 (HTTP ${step1.status})`);

  const files = {
    bundle: dir ? await zipDir(dir) : null,
    screenshot: screenshotPath ? await readFile(screenshotPath) : null,
    video: videoPath ? await readFile(videoPath) : null,
  };
  for (const kind of uploads) {
    const url = body1.uploads?.[kind];
    if (!url) throw new Error(`서버가 ${kind} 업로드 URL을 주지 않았어요.`);
    const put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: files[kind],
    });
    if (!put.ok) throw new Error(`${kind} 업로드 실패 (HTTP ${put.status})`);
  }

  const fin = await fetch(body1.finalizeUrl || `${origin.replace(/\/$/, "")}/api/ingest/finalize`, {
    method: "POST",
    headers: authJson,
    body: JSON.stringify({ projectId: body1.projectId }),
  });
  const body2 = await fin.json().catch(() => ({}));
  if (!fin.ok) throw new Error(body2.error || `업로드 마무리 실패 (HTTP ${fin.status})`);
  return body2;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "제목 없음";
  }
}

// `nookframe publish` CLI 명령. 플래그 → payload 조립 + 아티팩트 결정 + 진행 출력.
export async function publishCommand(args) {
  const token = getToken();
  const origin = args.origin || getOrigin();

  let payload = {};
  if (args.json) {
    try {
      payload = JSON.parse(args.json);
    } catch {
      throw new Error("--json 값을 JSON으로 읽을 수 없어요.");
    }
  }
  if (args.title) payload.title = args.title;
  if (args.hint) payload.demoHighlights = args.hint;
  if (args.url) payload.deployUrl = args.url;
  if (args["app-url"]) payload.appUrl = args["app-url"];
  // 로그인 필요 앱의 데모 모드 진입 정보 — url·params·note만(계정 정보는 서버가 안 받음).
  if (args["access-url"] || args["access-params"] || args["access-note"]) {
    const access = { ...(payload.demoAccess || {}) };
    if (args["access-url"]) access.url = args["access-url"];
    if (args["access-params"]) {
      access.params = Object.fromEntries(new URLSearchParams(args["access-params"]).entries());
    }
    if (args["access-note"]) access.note = args["access-note"];
    payload.demoAccess = access;
  }

  // 아티팩트: --dir 명시 > URL 있음 > 자동으로 빌드 디렉터리 탐색.
  let dir = args.dir ? resolve(args.dir) : null;
  if (!dir && !payload.deployUrl && !payload.appUrl) {
    for (const d of BUILD_DIRS) {
      const p = resolve(d);
      if (existsSync(join(p, "index.html"))) {
        dir = p;
        break;
      }
    }
  }

  // 제작자 미디어(요청1): 이미지≤5MB(png/jpg/webp/gif)·영상≤20MB(mp4/webm),
  // 검증은 서버(매직바이트)가 한다. 영상을 주면 발행 시 자동 촬영이 생략된다.
  const screenshotPath = args.screenshot ? resolve(args.screenshot) : null;
  const videoPath = args.video ? resolve(args.video) : null;
  if (screenshotPath && !existsSync(screenshotPath)) {
    throw new Error(`스크린샷 파일이 없어요: ${screenshotPath}`);
  }
  if (videoPath && !existsSync(videoPath)) {
    throw new Error(`영상 파일이 없어요: ${videoPath}`);
  }

  const shownUrl = payload.appUrl || payload.deployUrl;
  if (dir) console.log(`📦 ${dir} 압축·업로드 중…`);
  else if (shownUrl) console.log(`🔗 ${shownUrl} 등록 중…`);
  if (screenshotPath || videoPath) {
    console.log(`🖼️ 미디어 동봉: ${[screenshotPath, videoPath].filter(Boolean).map((p) => basename(p)).join(", ")}`);
  }

  const body = await runPublish({ payload, dir, screenshotPath, videoPath, token, origin });
  console.log("\n✓ Nookframe에 초안으로 올렸어요.");
  console.log(`  확인하고 공개: ${body.reviewUrl}`);
}
