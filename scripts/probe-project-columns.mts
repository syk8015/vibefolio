// projects 공개/비공개 칸 목록이 SQL GRANT와 맞는지, 사용자 키로 projects를 통째로
// 읽는 코드가 없는지(2026-09-23). 네트워크 없음.
//
// 지키는 것: supabase/migration_private_columns.sql이 anon·authenticated의 SELECT를
// 공개 칸으로만 허락한다. 그래서 ① lib/projectColumns.ts와 SQL의 칸 목록이 어긋나면
// 공개 칸이 안 읽혀 극장이 깨지거나 비공개 칸이 다시 샌다 ② select("*")/select()로
// projects를 읽으면 SQL 적용 뒤 permission denied로 깨진다.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_PROJECT_COLUMNS, PRIVATE_PROJECT_COLUMNS } from "../lib/projectColumns";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};

const sql = readFileSync("supabase/migration_private_columns.sql", "utf8");
const grant = sql.match(/grant select \(([\s\S]*?)\) on table public\.projects to anon, authenticated;/);
ok("SQL에 칸 단위 GRANT가 있다", !!grant);
const sqlCols = new Set((grant?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const pub = new Set<string>(PUBLIC_PROJECT_COLUMNS);
const priv = new Set<string>(PRIVATE_PROJECT_COLUMNS);
const missing = [...pub].filter((c) => !sqlCols.has(c));
const extra = [...sqlCols].filter((c) => !pub.has(c));
ok("PUBLIC 목록 == SQL GRANT 목록", !missing.length && !extra.length, `빠짐 ${missing.join(",") || "-"} / 남음 ${extra.join(",") || "-"}`);
ok("PUBLIC·PRIVATE가 겹치지 않는다", ![...priv].some((c) => pub.has(c)));
ok("SQL이 테이블 SELECT를 먼저 거둔다", /revoke select on table public\.projects from anon, authenticated;/.test(sql));

// 사용자 키 경로에서 projects를 통째로 읽는 코드 — 관리자 권한 파일도 같이 막는다
// (어느 클라이언트인지 정적으로 가르기 어렵고, 관리자 경로도 칸을 적는 편이 안전하다).
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const offenders: string[] = [];
for (const f of [...walk("app"), ...walk("lib"), ...walk("components")]) {
  const src = readFileSync(f, "utf8");
  // from("projects") 뒤 ~300자 안의 첫 select가 "*" 이거나 빈 select()인지.
  for (const m of src.matchAll(/from\(\s*["']projects["']\s*\)/g)) {
    const tail = src.slice(m.index!, m.index! + 300);
    const sel = tail.match(/\.select\(\s*(\)|["'`]\s*\*\s*["'`])/);
    const nextFrom = tail.slice(1).search(/from\(\s*["']/);
    if (sel && (nextFrom < 0 || sel.index! < nextFrom + 1)) {
      offenders.push(`${f}:${src.slice(0, m.index!).split("\n").length}`);
    }
  }
}
ok('projects를 select("*")·select()로 읽는 코드 없음', offenders.length === 0, offenders.join(" "));

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
