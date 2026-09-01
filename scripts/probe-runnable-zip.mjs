// 실행형 코드 zip 입구 완화(2026-08-20) prod E2E.
//   (1) 배포 대기 — 파이썬 zip이 받아들여질 때까지 폴링(구코드면 400 index-html-missing)
//   (2) 파이썬 zip → ok + demo_url이 app.py 앵커 + thumbnail 비움
//   (3) node CLI zip(bin) → ok + package.json 앵커
//   (4) 잡동사니 zip(코드 없음) → 400 거절
//   끝나면 throwaway 행·스토리지·토큰 정리.
// 사용: node scripts/probe-runnable-zip.mjs  (ingest 레이트리밋 20/h — 폴링 포함 ~10회 소비)
// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGIN = "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 픽스처 zip 3종
const S = mkdtempSync(join(tmpdir(), "nf-probe-rzip-"));
mkdirSync(join(S, "py"));
writeFileSync(join(S, "py", "app.py"), "import streamlit as st\nst.write('probe')\n");
writeFileSync(join(S, "py", "requirements.txt"), "streamlit\n");
mkdirSync(join(S, "cli"));
writeFileSync(join(S, "cli", "package.json"), JSON.stringify({ name: "probe-tool", bin: { ptool: "cli.js" } }));
writeFileSync(join(S, "cli", "cli.js"), "#!/usr/bin/env node\nconsole.log('hi')\n");
mkdirSync(join(S, "junk"));
writeFileSync(join(S, "junk", "notes.md"), "# just notes\n");
for (const d of ["py", "cli", "junk"]) {
  execFileSync("zip", ["-qr", join(S, `${d}.zip`), "."], { cwd: join(S, d) });
}

const { data: prof } = await svc.from("profiles").select("id").limit(1).maybeSingle();
const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc.from("api_tokens").insert({
  user_id: prof.id,
  token_hash: createHash("sha256").update(raw).digest("hex"),
  token_prefix: `${raw.slice(0, 14)}…`,
  name: "__probe_rzip_delete_me__",
}).select("id").single();

// 인제스트는 zip을 보기 전에 두 게이트를 먼저 통과시킨다: 대본(2026-08-25)과
// 로그인 답변(2026-08-27). 둘 다 없으면 앵커 판정에 닿지도 못하고 400이 난다.
const GATE = {
  demoScript: {
    steps: [
      { goal: "첫 화면 확인", where: "본문", action: "scroll", expect: "내용이 보인다" },
      { goal: "주요 버튼", where: "첫 버튼", action: "click", expect: "반응한다" },
      { goal: "결과 확인", where: "결과 영역", action: "focus", expect: "결과가 보인다" },
    ],
  },
  demoAccess: { noLogin: true },
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

const wipeProject = async (pid) => {
  const { data } = await svc.storage.from("project-files").list(`${prof.id}/${pid}`, { limit: 100 });
  const keys = (data ?? []).filter((f) => f.id).map((f) => `${prof.id}/${pid}/${f.name}`);
  if (keys.length) await svc.storage.from("project-files").remove(keys);
  await svc.from("projects").delete().eq("id", pid);
};

const made = [];
try {
  // (1) 배포 대기 — 최대 5분. 구코드는 파이썬 zip을 400으로 거절한다.
  let py = null;
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    py = await postZip(join(S, "py.zip"), "__probe_rzip_py__");
    if (py.status === 200) break;
    console.log(`  … 배포 대기 (status ${py.status})`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
  ok("(2) 파이썬 zip 초안 수락", py?.status === 200, JSON.stringify(py?.body).slice(0, 200));
  if (py?.status === 200) {
    made.push(py.body.projectId);
    const { data: row } = await svc.from("projects")
      .select("demo_url, thumbnail, is_draft").eq("id", py.body.projectId).single();
    ok("(2) demo_url = app.py 앵커", row?.demo_url?.endsWith("/app.py"), row?.demo_url);
    ok("(2) thumbnail 비움(소스 스크린샷 방지)", !row?.thumbnail, row?.thumbnail);
    ok("(2) 초안 상태", row?.is_draft === true);
  }

  const cli = await postZip(join(S, "cli.zip"), "__probe_rzip_cli__");
  ok("(3) node CLI zip 초안 수락", cli.status === 200, JSON.stringify(cli.body).slice(0, 200));
  if (cli.status === 200) {
    made.push(cli.body.projectId);
    const { data: row } = await svc.from("projects").select("demo_url").eq("id", cli.body.projectId).single();
    ok("(3) demo_url = package.json 앵커", row?.demo_url?.endsWith("/package.json"), row?.demo_url);
  }

  const junk = await postZip(join(S, "junk.zip"), "__probe_rzip_junk__");
  ok("(4) 코드 없는 zip은 400 거절", junk.status === 400, `status ${junk.status} ${JSON.stringify(junk.body).slice(0, 120)}`);
} finally {
  for (const pid of made) await wipeProject(pid);
  const { data: leftovers } = await svc.from("projects").select("id").like("title", "__probe_rzip_%");
  for (const r of leftovers ?? []) await wipeProject(r.id);
  if (tok) await svc.from("api_tokens").delete().eq("id", tok.id);
  console.log(`[cleanup] rows=${made.length} token 삭제 완료`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
