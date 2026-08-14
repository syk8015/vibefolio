import { existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { getToken, getOrigin } from "./config.js";
import { zipDir } from "./zip.js";

const BUILD_DIRS = ["dist", "out", "build", "public"];

// CLI와 MCP가 공유하는 인제스트 코어. payload(제목·설명 등) + (dir zip | deployUrl) 중
// 하나로 POST /api/ingest. 성공 시 { projectId, reviewUrl } 반환, 실패 시 throw.
export async function runPublish({ payload = {}, dir = null, token, origin }) {
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

  let res;
  if (dir) {
    const buf = await zipDir(dir);
    const fd = new FormData();
    fd.append("payload", JSON.stringify(payload));
    fd.append("bundle", new Blob([buf], { type: "application/zip" }), "bundle.zip");
    // FormData는 fetch가 boundary 포함 Content-Type을 자동 설정 — 직접 넣지 않는다.
    res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
  } else if (entryUrl) {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } else {
    throw new Error("올릴 대상이 없어요 — 배포 URL은 --url, 정적 빌드는 --dir 로 알려주세요.");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `업로드 실패 (HTTP ${res.status})`);
  }
  return body;
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

  const shownUrl = payload.appUrl || payload.deployUrl;
  if (dir) console.log(`📦 ${dir} 압축·업로드 중…`);
  else if (shownUrl) console.log(`🔗 ${shownUrl} 등록 중…`);

  const body = await runPublish({ payload, dir, token, origin });
  console.log("\n✓ Nookframe에 초안으로 올렸어요.");
  console.log(`  확인하고 공개: ${body.reviewUrl}`);
}
