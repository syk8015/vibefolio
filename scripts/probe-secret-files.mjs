// 업로드 비밀 파일 차단(2026-09-01) — 규칙 단위 + prod E2E.
//   (A) 규칙 표: 막아야 할 22건 전부 막고, 막으면 안 될 15건은 전부 통과
//   (B) .env·.git/·index.html 든 zip → 200 + droppedFiles 에코 + 스토리지에 비밀 0
//   (C) /api/preview 로 .env 직격 → 404 (이미 저장된 것에 대한 마지막 그물)
//   (D) 비밀만 든 zip → 400 zip-only-secrets
//   끝나면 throwaway 행·스토리지·토큰 정리.
// 사용: node scripts/probe-secret-files.mjs   (ingest 레이트리밋 20/h 소비)
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { secretFileKind } from "../lib/upload-safety.ts";

const ORIGIN = "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// ── (A) 규칙 표 — 네트워크 없이 즉시.
const MUST_BLOCK = [".env", ".env.local", "app/.env.production", ".env/lib/x", ".envrc",
  ".git/config", ".git/objects/ab/cdef", "sub/.git/HEAD", ".ssh/id_rsa", "keys/id_ed25519",
  "certs/server.pem", "a/b.p12", "store.jks", ".npmrc", ".pypirc", ".netrc",
  ".aws/credentials", ".htpasswd", "firebase-adminsdk-abc.json",
  "config/service_account.json", "x/serviceAccount.json", "credentials.json"];
// 오탐 방지 — 이름이 비슷하지만 비밀이 아닌 것들. 여기가 깨지면 멀쩡한 작품이 망가진다.
const MUST_PASS = [".gitignore", ".github/workflows/ci.yml", "src/env.ts", "src/environment.js",
  "index.html", "assets/envelope.svg", "README.md", "package.json", "app.py",
  "src/gitlab.js", "data/credentials.md", "styles/main.css", "pubspec.yaml",
  "lib/id_rsa_helper.js", "docs/environment.md"];
const missed = MUST_BLOCK.filter((p) => !secretFileKind(p));
const falsePos = MUST_PASS.filter((p) => secretFileKind(p));
ok(`(A) 비밀 경로 ${MUST_BLOCK.length}건 전부 차단`, missed.length === 0, missed.join(", "));
ok(`(A) 정상 경로 ${MUST_PASS.length}건 전부 통과`, falsePos.length === 0, falsePos.join(", "));

// ── 픽스처 zip 2종
const S = mkdtempSync(join(tmpdir(), "nf-probe-secret-"));
mkdirSync(join(S, "mixed", ".git"), { recursive: true });
writeFileSync(join(S, "mixed", "index.html"), "<!doctype html><h1>probe</h1>");
writeFileSync(join(S, "mixed", ".env"), "OPENAI_API_KEY=sk-probe-should-never-be-stored\n");
writeFileSync(join(S, "mixed", ".env.local"), "DB_URL=postgres://probe\n");
writeFileSync(join(S, "mixed", ".gitignore"), "node_modules\n"); // 살아남아야 한다
writeFileSync(join(S, "mixed/.git", "config"), "[core]\n");
mkdirSync(join(S, "onlysecret"), { recursive: true });
writeFileSync(join(S, "onlysecret", ".env"), "SECRET=1\n");
for (const d of ["mixed", "onlysecret"]) {
  execFileSync("zip", ["-qr", join(S, `${d}.zip`), ".", "-x", ".DS_Store"], { cwd: join(S, d) });
}

const { data: prof } = await svc.from("profiles").select("id").limit(1).maybeSingle();
const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc.from("api_tokens").insert({
  user_id: prof.id,
  token_hash: createHash("sha256").update(raw).digest("hex"),
  token_prefix: `${raw.slice(0, 14)}…`,
  name: "__probe_secret_delete_me__",
}).select("id").single();

// 인제스트는 zip을 보기 전에 대본·로그인 답변 게이트를 먼저 통과시킨다.
const GATE = {
  demoScript: {
    steps: [
      { goal: "첫 화면 확인", where: "본문", action: "scroll", expect: "내용이 보인다" },
      { goal: "주요 버튼", where: "첫 버튼", action: "click", expect: "반응한다" },
      { goal: "결과 확인", where: "결과 영역", action: "focus", expect: "결과가 보인다" },
      { goal: "상단 힌트", where: "상단 제목", action: "hover", expect: "설명이 뜬다" },
    ],
  },
  demoAccess: { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" },
  description: "프로브가 만든 임시 행\n곧 지워집니다",
};

const postZip = async (zipPath, title) => {
  const form = new FormData();
  form.set("payload", JSON.stringify({ title, ...GATE }));
  form.set("bundle", new Blob([readFileSync(zipPath)], { type: "application/zip" }), "bundle.zip");
  const res = await fetch(`${ORIGIN}/api/ingest`, {
    method: "POST", headers: { Authorization: `Bearer ${raw}` }, body: form,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const walk = async (prefix) => {
  const out = [];
  const queue = [prefix];
  while (queue.length) {
    const dir = queue.shift();
    const { data } = await svc.storage.from("project-files").list(dir, { limit: 1000 });
    for (const e of data ?? []) {
      const full = `${dir}/${e.name}`;
      if (e.id === null) queue.push(full); else out.push(full);
    }
  }
  return out;
};

const wipeProject = async (pid) => {
  const keys = await walk(`${prof.id}/${pid}`);
  if (keys.length) await svc.storage.from("project-files").remove(keys);
  await svc.from("projects").delete().eq("id", pid);
};

const made = [];
try {
  // 배포 대기 — 구코드는 droppedFiles를 안 돌려준다.
  let mixed = null;
  const deadline = Date.now() + 5 * 60_000;
  for (;;) {
    mixed = await postZip(join(S, "mixed.zip"), "__probe_secret_mixed__");
    if (mixed.status === 200) made.push(mixed.body.projectId);
    if (mixed.status === 200 && Array.isArray(mixed.body.droppedFiles)) break;
    if (Date.now() > deadline) break;
    console.log(`  … 배포 대기 (status ${mixed.status}, dropped=${JSON.stringify(mixed.body.droppedFiles)})`);
    await new Promise((r) => setTimeout(r, 30_000));
  }

  ok("(B) 비밀 섞인 zip은 그대로 수락(거절 아님)", mixed.status === 200, `status ${mixed.status}`);
  const dropped = mixed.body.droppedFiles;
  ok("(B) droppedFiles 에코 존재", Array.isArray(dropped) && dropped.length > 0, JSON.stringify(dropped));
  const droppedText = (dropped ?? []).join(" | ");
  ok("(B) 에코에 .env 언급", droppedText.includes(".env"), droppedText);
  ok("(B) 에코에 .git 언급", droppedText.includes(".git"), droppedText);

  if (mixed.status === 200) {
    const keys = await walk(`${prof.id}/${mixed.body.projectId}`);
    const rel = keys.map((k) => k.replace(`${prof.id}/${mixed.body.projectId}/`, ""));
    ok("(B) 스토리지에 .env 없음", !rel.some((p) => p === ".env" || p === ".env.local"), rel.join(", "));
    ok("(B) 스토리지에 .git/ 없음", !rel.some((p) => p.startsWith(".git/")), rel.join(", "));
    ok("(B) index.html은 저장됨", rel.includes("index.html"), rel.join(", "));
    ok("(B) .gitignore는 오탐 없이 저장됨", rel.includes(".gitignore"), rel.join(", "));

    // (C) 서빙 차단 — 스토리지에 있었다 해도 이 라우트로는 안 나간다.
    const base = `${ORIGIN}/api/preview/${prof.id}/${mixed.body.projectId}`;
    const good = await fetch(`${base}/index.html`);
    ok("(C) preview: index.html은 200", good.status === 200, `status ${good.status}`);
    for (const p of [".env", ".env.local", ".git/config"]) {
      const res = await fetch(`${base}/${p}`);
      ok(`(C) preview: ${p} 는 404`, res.status === 404, `status ${res.status}`);
    }
  }

  // (D) 비밀만 든 zip.
  const only = await postZip(join(S, "onlysecret.zip"), "__probe_secret_only__");
  if (only.body?.projectId) made.push(only.body.projectId);
  ok("(D) 비밀만 든 zip은 400", only.status === 400, `status ${only.status} ${JSON.stringify(only.body).slice(0, 160)}`);
  // PAT 경로 응답은 영어 고정(의도) — 한국어로 찾으면 안 걸린다.
  ok("(D) 400 사유가 '안전상 제외'임을 밝힘",
    typeof only.body?.error === "string" && /for safety/i.test(only.body.error),
    JSON.stringify(only.body).slice(0, 200));
} finally {
  for (const pid of made) await wipeProject(pid);
  const { data: leftovers } = await svc.from("projects").select("id").like("title", "__probe_secret_%");
  for (const r of leftovers ?? []) await wipeProject(r.id);
  if (tok) await svc.from("api_tokens").delete().eq("id", tok.id);
  console.log(`[cleanup] rows=${made.length} token 삭제 완료`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
