// 실서버 검사 — 올리기 전 개인정보 경고(2026-10-02, lib/uploadWarnings.ts + cli/src/zip.js).
// CLI 코드(runPublish)를 그대로 import해 진짜 2단계 업로드로 본다. 끝나면 초안·토큰을 지운다.
//   (1) 폴더 업로드 → privacyWarnings에 이메일·데이터 폴더 줄, 주소 값은 없음
//   (2) .gitignore에 적힌 private/ 는 안 올라감(gitignored 1 · 미리보기 404)
//   (3) 글자 하나짜리 htmlBody(JSON 경로)에도 같은 경고
//   (4) 깨끗한 폴더는 경고 없음
// 사용: node scripts/probe-privacy-warnings.mjs — ingest 한도(유저 20/h)를 4~5회 쓴다.
import "./_secrets.mjs";
import { wipeProbeDraft } from "./_probeFiles.mjs";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPublish } from "../cli/src/publish.js";

const ORIGIN = "https://nookframe.com";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SCRIPT = {
  steps: [
    { goal: "첫 화면", selector: "#a", action: "click", expect: "열린다", hold: 1 },
    { goal: "입력", selector: "#b", action: "type", text: "hello", expect: "글자가 보인다" },
    { goal: "결과", selector: "#c", action: "focus", expect: "결과가 보인다" },
    { goal: "되돌아오기", selector: "#d", action: "click", expect: "첫 화면" },
  ],
};
const BASE = {
  targetDevice: "desktop",
  description: "프로브가 만든 임시 행\n곧 지워집니다",
  demoScript: SCRIPT,
  demoAccess: { noLogin: true, note: "프로브 픽스처 — 인증 가드 없는 정적 페이지" },
  ownerInterview: { proudMoment: "프로브가 만든 장면", howIUse: "프로브가 확인용으로 씀", mustSee: "프로브 확인 문구" },
  language: "ko", appLanguages: ["ko", "en"],
  translation: { title: "Probe", description: "A temporary row made by a probe\nDeleted right away" },
};
const EMAIL = "minsu.probe.owner@gmail.com";

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const { data: prof } = await svc.from("profiles").select("id").eq("username", "vivestarter").maybeSingle();
const raw = `nf_live_${randomBytes(32).toString("base64url")}`;
const { data: tok } = await svc.from("api_tokens").insert({
  user_id: prof.id,
  token_hash: createHash("sha256").update(raw).digest("hex"),
  token_prefix: `${raw.slice(0, 14)}…`,
  name: "__probe_e2e_delete_me__",
}).select("id").single();
const made = [];
const S = mkdtempSync(join(tmpdir(), "nf-probe-privacy-"));
const w = (p, s) => { mkdirSync(join(S, p, ".."), { recursive: true }); writeFileSync(join(S, p), s); };

try {
  // 폴더 픽스처 — 이메일 든 페이지, 3MB 데이터 폴더, .gitignore로 뺄 private/.
  w("dirty/index.html", `<!doctype html><title>probe</title><h1>probe</h1><p>contact ${EMAIL}</p><div id=a></div><div id=b></div><div id=c></div><div id=d></div>`);
  w("dirty/data/readings.csv", "t,v\n".repeat(800_000));
  w("dirty/.gitignore", "private/\n");
  w("dirty/private/notes.txt", "do not upload");
  w("clean/index.html", "<!doctype html><title>probe</title><h1>clean</h1><div id=a></div><div id=b></div><div id=c></div><div id=d></div>");

  // (1)(2) 폴더 업로드.
  let r1 = null;
  try {
    r1 = await runPublish({ payload: { ...BASE, title: "__probe_privacy_dir__" }, dir: join(S, "dirty"), token: raw, origin: ORIGIN });
  } catch (e) {
    ok("폴더 발행 성공", false, e.message);
  }
  if (r1?.projectId) {
    made.push(r1.projectId);
    const warns = r1.privacyWarnings ?? [];
    const all = warns.join("\n");
    ok("이메일 경고 줄(index.html)", /Email addresses found in 1 file\(s\): index\.html \(1\)/.test(all), all || "(없음)");
    ok("데이터 폴더 경고 줄(data/)", /Data folders uploaded: data\//.test(all), all || "(없음)");
    ok("주소 값은 응답에 없음", !JSON.stringify(r1).includes(EMAIL));
    ok("마지막 줄은 주인에게 물으라는 할 일", /Ask the owner/.test(warns.at(-1) ?? ""));
    ok(".gitignore로 1개 뺌", r1.gitignored === 1, String(r1.gitignored));
    const { data: row } = await svc.from("projects").select("demo_url").eq("id", r1.projectId).single();
    const base = (row?.demo_url ?? "").replace(/index\.html$/, "");
    const priv = await fetch(`${ORIGIN}${base}private/notes.txt`);
    const page = await fetch(`${ORIGIN}${row?.demo_url}`);
    ok("private/notes.txt는 미리보기에 없음(404)", priv.status === 404, `${priv.status}`);
    ok("index.html은 올라감(200)", page.status === 200, `${page.status}`);
  }

  // (3) htmlBody(JSON 경로) — 글자로 온 페이지에도 같은 경고.
  const res3 = await fetch(`${ORIGIN}/api/ingest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${raw}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...BASE, title: "__probe_privacy_html__", htmlBody: `<!doctype html><html><head><title>p</title></head><body><p>${EMAIL}</p><div id=a></div><div id=b></div><div id=c></div><div id=d></div></body></html>` }),
  });
  const b3 = await res3.json().catch(() => ({}));
  if (b3.projectId) made.push(b3.projectId);
  ok("htmlBody 발행에도 이메일 경고", res3.ok && (b3.privacyWarnings ?? []).some((l) => l.startsWith("Email addresses")), `${res3.status} ${JSON.stringify(b3.privacyWarnings ?? b3.error ?? null)}`);

  // (4) 깨끗한 폴더.
  try {
    const r4 = await runPublish({ payload: { ...BASE, title: "__probe_privacy_clean__" }, dir: join(S, "clean"), token: raw, origin: ORIGIN });
    if (r4?.projectId) made.push(r4.projectId);
    ok("깨끗한 폴더는 경고 없음", !r4.privacyWarnings && !r4.gitignored, JSON.stringify(r4.privacyWarnings ?? null));
  } catch (e) {
    ok("깨끗한 폴더 발행 성공", false, e.message);
  }
} finally {
  for (const id of made) await wipeProbeDraft({ svc, token: raw, id }).catch(() => {});
  const { data: left } = await svc.from("projects").select("id").like("title", "__probe_privacy_%");
  for (const r of left ?? []) await wipeProbeDraft({ svc, token: raw, id: r.id }).catch(() => {});
  await svc.from("api_tokens").delete().eq("id", tok.id);
  rmSync(S, { recursive: true, force: true });
}
const { data: after } = await svc.from("projects").select("id").like("title", "__probe_privacy_%");
ok("프로브 초안 남지 않음", (after ?? []).length === 0, String((after ?? []).length));

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n전부 통과");
