// 영어 말투 검사(2026-11-06) — docs/brand.md §11 '영어 말투 기준' + docs/banned-words.json.
// 화면 글(lib/i18n/dictionaries/en.ts)·홈 소개 줄·홈 문구·로그인 밈을 scripts/copy-voice.mjs로 잰다.
// 지금 있는 어긋남은 기준선(scripts/copy-voice-baseline.json)에 적어 두고 **새로 생긴 것만** 실패시킨다(톱니 방식,
// probe-ui-rules와 같다). 지금 있는 것은 '영어 문구 모아 고치기' 때 고치고 기준선을 줄인다.
//
// 예외가 맞으면 그 줄이나 바로 윗줄에 `// copy-allow: <규칙> <까닭>`을 적는다.
// 쓰는 법: node scripts/probe-copy-voice.mjs          검사(npm test에 들어 있다)
//          node scripts/probe-copy-voice.mjs --list   지금 어긋남·경고 전부
//          npm run copy:baseline                      고쳐서 줄었을 때 기준선 다시 쓰기 — 규칙마다 수가 늘면 거절
import ts from "typescript";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checkEnglish, RULE_NAMES, WORD_CAPS } from "./copy-voice.mjs";

const BASELINE = "scripts/copy-voice-baseline.json";
const MODE = process.argv.includes("--write") ? "write" : process.argv.includes("--list") ? "list" : "check";
// 끝 마침표를 봐주는 곳 — 긴 메일(§11 예외)
const LONG_FORM = [/^email\./];

function parse(file) {
  const text = readFileSync(file, "utf8");
  return { text, lines: text.split("\n"), sf: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) };
}
function literalText(n) {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map((s) => "{x}" + s.literal.text).join("");
  return null;
}
function allowed(file, sf, lines, node, rule) {
  const line = sf.getLineAndCharacterOfPosition(node.getStart()).line;
  return [lines[line], lines[line - 1] ?? ""].some((l) => new RegExp(`copy-allow:\\s*${rule}\\b`).test(l));
}
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

// 0. 검사기 자체 — 막을 것은 막고, 글자 뜻은 지나가게
{
  const rules = (t, o) => checkEnglish(t, o).map((v) => v.rule + (v.id ? ":" + v.id : "")).sort().join(",");
  const cases = [
    ["Ship it.", "period"],
    ["Ship it", ""],
    ["Shipping…", ""],
    ["nookframe makes it seamless", "word:H20"],
    ["Nookframe is live", "name:N05"],
    ["nookframe is live", ""],
    ["Built in a weekend — shipped", "dash"],
    ["Wow!", "bang"],
    ["Loading...", "dots"],
    ["Your magic link is here", ""],
    ["Record in landscape", ""],
    ["Your API key expired", ""],
    ["Key features", "word:H72"],
    ["Get Started With Your Free Portfolio", "title-case,warn:H92"],
    ["It actually works", "warn:H55a"],
    ["A home for your apps", "word:N01"],
    ["Home", ""],
    ["Built with Swift", ""],
    ["Let us leverage AI", "word:H27"],
    ["one two three four five six seven eight nine ten", "length"],
  ];
  const bad = cases.filter(([t, want]) => rules(t, { cap: 9 }) !== want);
  if (bad.length) {
    for (const [t, want] of bad) console.log(`✗ 검사기: "${t}" → [${rules(t, { cap: 9 })}] (기대 [${want}])`);
    process.exit(1);
  }
}

const hits = []; // { key, rule, level, file, line, text, hit }
function record(file, sf, lines, node, where, text, opts) {
  for (const v of checkEnglish(text, opts)) {
    if (allowed(file, sf, lines, node, v.rule)) continue;
    hits.push({ key: `${v.rule}${v.id ? ":" + v.id : ""}|${where}`, rule: v.rule, level: v.level, file, line: lineOf(sf, node), text, hit: v.hit });
  }
}

// 1. 화면 글 사전 — 키 경로마다, 문자열이 여럿이면 #순번
{
  const file = "lib/i18n/dictionaries/en.ts";
  const { sf, lines } = parse(file);
  const visit = (node, path) => {
    if (ts.isObjectLiteralExpression(node)) {
      for (const p of node.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const name = p.name.getText(sf).replace(/^["']|["']$/g, "");
        visit(p.initializer, path ? `${path}.${name}` : name);
      }
      return;
    }
    let i = 0;
    const walk = (n) => {
      const t = literalText(n);
      if (t !== null && /[A-Za-z]{2}/.test(t)) {
        const where = `en:${path}${i ? "#" + i : ""}`;
        i++;
        record(file, sf, lines, n, where, t, { period: !LONG_FORM.some((r) => r.test(path)) });
        return;
      }
      if (ts.isObjectLiteralExpression(n)) return visit(n, path);
      ts.forEachChild(n, walk);
    };
    walk(node);
  };
  sf.forEachChild(function find(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "en" && n.initializer) visit(n.initializer, "");
    else ts.forEachChild(n, find);
  });
}

// 2. 홈 소개 줄·홈 문구·로그인 밈 — 배열 이름으로 찾고, 글 자체를 열쇠로(순서가 바뀌어도 같은 줄)
function arrayStrings(file, name, fn) {
  const { sf, lines } = parse(file);
  sf.forEachChild(function find(n) {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === name && n.initializer && ts.isArrayLiteralExpression(n.initializer)) {
      for (const el of n.initializer.elements) fn(sf, lines, el);
    } else ts.forEachChild(n, find);
  });
}
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
for (const [name, cap, tag] of [["taglineIntrosEn", WORD_CAPS.intro, "intro"], ["taglinesEn", WORD_CAPS.home, "home"]]) {
  arrayStrings("lib/taglines.ts", name, (sf, lines, el) => {
    const t = literalText(el);
    if (t !== null) record("lib/taglines.ts", sf, lines, el, `${tag}:${norm(t)}`, t, { cap });
  });
}
arrayStrings("lib/loggedInTaglines.ts", "loggedInTaglinesEn", (sf, lines, el) => {
  if (!ts.isObjectLiteralExpression(el)) return;
  for (const p of el.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const k = p.name.getText(sf);
    const t = literalText(p.initializer);
    if ((k === "text" || k === "reply") && t !== null) record("lib/loggedInTaglines.ts", sf, lines, p.initializer, `meme-${k}:${norm(t)}`, t, { cap: WORD_CAPS.loggedIn });
  }
});

const block = hits.filter((h) => h.level === "block");
const warns = hits.filter((h) => h.level === "warn");
const totals = (keys) => Object.fromEntries(Object.keys(RULE_NAMES).filter((r) => r !== "warn").map((r) => [r, keys.filter((k) => k.startsWith(r + ":") || k.startsWith(r + "|")).length]));

if (MODE === "list") {
  for (const h of [...block, ...warns]) console.log(`${h.file}:${h.line}  [${h.rule}${h.hit ? " " + h.hit : ""}] ${h.text.slice(0, 100)}`);
  console.log(`\n금지 ${block.length}곳 · 경고 ${warns.length}곳`);
  process.exit(0);
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
const nowKeys = [...new Set(block.map((h) => h.key))].sort();

if (MODE === "write") {
  const now = totals(nowKeys);
  if (base) {
    const was = totals(base.keys);
    const grew = Object.keys(now).filter((r) => now[r] > (was[r] ?? 0));
    if (grew.length) {
      console.log(`✗ 기준선은 줄일 때만 다시 쓴다 — 늘어난 규칙: ${grew.map((r) => `${r} ${was[r] ?? 0}→${now[r]}`).join(", ")}`);
      console.log("  새 어긋남은 고치거나, 맞는 예외면 그 줄에 `// copy-allow: <규칙> <까닭>`을 적는다.");
      process.exit(1);
    }
  }
  writeFileSync(BASELINE, JSON.stringify({
    note: "영어 말투 검사(scripts/probe-copy-voice.mjs)의 기준선 — 여기 적힌 어긋남은 봐준다(2026-11-06에 있던 것). '영어 문구 모아 고치기' 때 고치고, 줄었을 때만 `npm run copy:baseline`으로 다시 쓴다(늘리는 쓰기는 거절된다).",
    totals: now,
    keys: nowKeys,
  }, null, 1) + "\n");
  console.log(`✓ 기준선을 썼어요 — ${Object.entries(now).map(([r, n]) => `${r} ${n}`).join(" · ")}`);
  process.exit(0);
}

if (!base) {
  console.log(`✗ 기준선(${BASELINE})이 없다 — npm run copy:baseline으로 처음 한 번 만든다.`);
  process.exit(1);
}
const known = new Set(base.keys);
const fresh = block.filter((h) => !known.has(h.key));
const fixed = base.keys.filter((k) => !nowKeys.includes(k)).length;
if (fresh.length) {
  console.log(`✗ 영어 말투(docs/brand.md §11·docs/banned-words.json)에 새로 어긋난 곳 ${fresh.length}개`);
  for (const h of fresh) console.log(`  ${h.file}:${h.line}  [${h.rule}${h.hit ? " " + h.hit : ""}] ${h.text.slice(0, 100)}\n      → ${RULE_NAMES[h.rule]}`);
  console.log("  고치거나, 맞는 예외면 그 줄에 `// copy-allow: <규칙> <까닭>`을 적는다.");
  process.exit(1);
}
console.log(`✓ 영어 말투: 새 어긋남 없음 (기준선 ${base.keys.length}곳${fixed ? ` · 그중 ${fixed}곳은 고쳐졌어요 — npm run copy:baseline으로 굳히기` : ""} · 경고 낱말 ${warns.length}곳)`);
