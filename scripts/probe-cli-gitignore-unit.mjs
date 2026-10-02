// CLI zip의 .gitignore 존중(2026-10-02, cli/src/zip.js). 네트워크 없음 — 임시 폴더를 만들어 zip을 열어 본다.
// 지키는 것: 적힌 것은 빠지고, `!`로 되살린 것·폴더 위의 .gitignore·비밀 파일 규칙은 그대로.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import JSZip from "jszip";
import { zipDirWithInfo, parseGitignore, isIgnored } from "../cli/src/zip.js";

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

// 1. 규칙 해석 — 경로 문자열만으로.
{
  const r = parseGitignore("# 주석\n\n*.log\n!keep.log\n/build\ndata/\nsecret-notes.md\ndocs/**/draft-*.md\n");
  const t = (p, dir = false) => isIgnored(r, p, dir);
  ok("*.log는 어느 깊이든", t("a.log") && t("x/y/b.log"));
  ok("!keep.log는 되살림", !t("keep.log"));
  ok("/build는 맨 위만", t("build", true) && !t("src/build", true));
  ok("data/는 폴더만(같은 이름 파일은 통과)", t("data", true) && t("x/data", true) && !t("data", false));
  ok("이름만 쓴 파일은 어느 깊이든", t("secret-notes.md") && t("a/secret-notes.md"));
  ok("**는 중간 폴더 0개 이상", t("docs/draft-1.md") && t("docs/a/b/draft-2.md") && !t("docs/a/final.md"));
  const sub = parseGitignore("*.csv\n", "app");
  ok("하위 .gitignore는 그 폴더 아래만", isIgnored(sub, "app/x.csv", false) && !isIgnored(sub, "x.csv", false));
}

// 2. 실제 폴더를 zip으로.
const root = mkdtempSync(join(tmpdir(), "nf-gitignore-"));
try {
  const w = (p, s = "x") => { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), s); };
  w(".gitignore", "data/\n*.log\n!keep.log\n");
  w("index.html", "<h1>hi</h1>");
  w("data/readings.csv", "1,2");
  w("server.log");
  w("keep.log");
  w("app/.gitignore", "local.json\n");
  w("app/local.json", "{}");
  w("app/main.js", "1");
  w(".env", "SECRET=1");
  const { buffer, gitignored } = await zipDirWithInfo(root);
  const names = Object.keys((await JSZip.loadAsync(buffer)).files).filter((n) => !n.endsWith("/")).sort();
  ok("남은 파일", JSON.stringify(names) === JSON.stringify([".gitignore", "app/.gitignore", "app/main.js", "index.html", "keep.log"]), names.join(", "));
  ok("뺀 항목 수 = data/ 폴더 1 + server.log 1 + app/local.json 1", gitignored === 3, String(gitignored));

  // 3. 올리는 폴더 위의 .gitignore는 안 읽는다 — dist/를 적은 레포 루트에서 --dir dist.
  const repo = mkdtempSync(join(tmpdir(), "nf-gitignore-repo-"));
  try {
    mkdirSync(join(repo, "dist"));
    writeFileSync(join(repo, ".gitignore"), "dist/\n");
    writeFileSync(join(repo, "dist", "index.html"), "<h1>built</h1>");
    const r2 = await zipDirWithInfo(join(repo, "dist"));
    ok("--dir dist는 루트 .gitignore의 dist/에 안 걸림", r2.gitignored === 0 && Object.keys((await JSZip.loadAsync(r2.buffer)).files).includes("index.html"));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }

  // 4. 전부 적혀 있으면 이유를 말하고 멈춘다.
  const all = mkdtempSync(join(tmpdir(), "nf-gitignore-all-"));
  try {
    writeFileSync(join(all, ".gitignore"), "*\n");
    writeFileSync(join(all, "a.txt"), "x");
    let msg = "";
    try { await zipDirWithInfo(all); } catch (e) { msg = e.message; }
    ok("전부 빠지면 .gitignore 때문이라고 말함", /\.gitignore/.test(msg), msg);
  } finally {
    rmSync(all, { recursive: true, force: true });
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failed) {
  console.log(`\n${failed}개 실패`);
  process.exit(1);
}
console.log("\n전부 통과");
