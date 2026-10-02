// 화면·글 기준(docs/ui-rules.md) 가운데 기계로 잴 수 있는 것을 잰다(2026-10-02).
// 지금 있는 어긋남은 기준선(scripts/ui-rules-baseline.json)에 적어 두고, **새로 생긴 것만** 실패시킨다 —
// 다 고친 뒤에 켜려면 영영 못 켜므로, 더 늘지 않게 막는 것부터 한다(톱니 방식).
//
// 예외가 맞으면 그 줄이나 바로 윗줄에 `ui-allow: <규칙> <까닭>`을 적는다(JSX 안은 {/* ui-allow: … */}).
//   예) boxShadow: "inset 0 0 0 1px var(--danger)", // ui-allow: border 틀린 입력칸 표시
// 쓰는 법: node scripts/probe-ui-rules.mjs          검사(npm test에 들어 있다)
//          node scripts/probe-ui-rules.mjs --list   지금 어긋남 전부(파일:줄)
//          npm run ui:baseline                      고쳐서 줄었을 때 기준선 다시 쓰기 — 규칙마다 수가 늘면 거절
// 주석은 보지 않는다 — TypeScript 구문 나무로 코드의 글자·스타일 값만 읽는다.
import ts from "typescript";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASELINE = "scripts/ui-rules-baseline.json";
const MODE = process.argv.includes("--write") ? "write" : process.argv.includes("--list") ? "list" : "check";

const RULES = {
  size: "낱말 글자가 13px보다 작다 — 12 이하는 숫자만",
  color: "직접 쓴 색 — globals.css 변수(var(--…))만 쓴다(다크 모드에서 틀어진다)",
  border: "1px 테두리·고리로 친 상자 — 선 대신 옅은 채움으로 나눈다",
  font: "정해 둔 글꼴 밖 — var(--font-nunito|mono|serif)만",
  bar: "가로를 꽉 채운 진한 버튼 — 글자만큼의 알약, 가운데",
  "raw-error": "개발용 실패 문구 — 서버 실패는 { error }(body.message는 없다), HTTP 숫자를 화면에 내지 않는다",
  tone: "해요체 밖(합니다체) 또는 과한 높임",
  name: "공개 페이지를 '명함'·'card page'로 부른다 — 페이지는 프레임, 명함은 명함 카드만",
  "ko-jsx": "화면 글을 사전 밖 JSX에 한국어로 박았다 — lib/i18n/dictionaries에 키로",
};

// 통째로 보지 않는 곳(까닭)
const SKIP = [
  /^app\/promo-record\//, // 홍보 영상 녹화용 내부 화면
  /^app\/intro-render\//, // 워커가 소개 영상을 찍는 화면
  /(opengraph|twitter)-image\.tsx$/, // 공유 이미지 그리기(next/og) — CSS 변수가 없다
  /^app\/global-error\.tsx$/, // 앱 CSS 없이 뜨는 마지막 오류 화면
  /^components\/introFilm\//, // 소개 영상 그림(늘 어두운 무대 안)
];
// 꾸밈 그림 — 이 규칙들만 뺀다(그림 속 글자·색은 화면 규칙이 아니다)
const DECOR = {
  "components/UploadAnythingSection.tsx": ["size", "color", "border", "font"], // 첫 화면의 움직이는 앱 그림
  "components/PortfolioPipSection.tsx": ["size", "color", "border", "font"], // 첫 화면 작은 창 그림
  "components/ViewportFrame.tsx": ["size", "color", "border", "font"], // 폰 틀 그림
  "components/dashboard/projects/PreviewDevice.tsx": ["size", "color", "border", "font"], // 검토 창 폰·PC 틀 그림
  "components/theater/Meishi.tsx": ["size", "color", "border", "font"], // 명함 카드(PC 8px 그대로 — 정한 것)
};
// 'ko-jsx'를 보지 않는 곳 — 한국어로만 쓰기로 한 관리 화면, 본문을 언어별로 통째 가르는 문서
const KO_JSX_OK = [/^app\/admin\//, /^components\/admin\//, /^app\/privacy\//, /^app\/terms\//, /^app\/docs\//];
// '명함'을 써도 되는 사전 키 — 명함 카드와 대시보드 명함 탭
const NAME_OK = [/^dashboard\.tabCard$/, /^card\./, /^theater\.aboutLabel$/];

const HANGUL = /[가-힣]/;
const HEX = /(?<![\w&/#-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const COLOR_FN = /\b(?:rgba?|hsla?)\(/g;
const TW_COLOR = /(?:^|\s)(?:[\w-]+:)*(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?:\/\d+)?(?=\s|$)/g;
const TW_SHADOW = /(?:^|\s)(?:[\w-]+:)*shadow-(?:sm|md|lg|xl|2xl)(?=\s|$)/g;
// 폰 전용(max-md:, max-sm:)은 동결 중이라 보지 않는다
const TW_SIZE = /(?:^|\s)((?:(?!max-)[\w-]+:)*)text-(xs|\[(\d*\.?\d+)(px|rem)\])(?=\s|$)/g;
const TW_BORDER = /(?:^|\s)border(?=\s|$)/;
const BAR_BTN = /vf-button-(?:primary|danger)\b/;
const BAR_WIDE = /(?:^|\s)(?:(?:md|lg|xl|2xl):)?(?:w-full|flex-1)(?=\s|$)/;
const BORDER_VALUE = /\b(?:0?\.\d+|\d+(?:\.\d+)?)px\s+(?:solid|dashed|dotted)\b/;
const RING_VALUE = /(?:^|,)\s*(?:inset\s+)?0(?:px)?\s+0(?:px)?\s+0(?:px)?\s+(?:0?\.\d+|1(?:\.\d+)?)px\b/;
const TONE = /[가-힣](?:니다|니까|십시오)(?=$|[\s.,!?)"'」』—…*\]~:])/;
const HONORIFIC = /(?:시겠어요|시겠습니까|주시기 바랍니다|하셔도|으셔도|시면 돼요)/;
const NAME_EN = /\b(?:public card|card page|portfolio page|profile page)\b/i;
const RESP = new Set(["body", "data", "json", "payload", "j", "resBody", "result"]);

const hits = [];
const norm = (s) => s.replace(/\s+/g, " ").trim().slice(0, 80);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && !e.name.startsWith(".")) walk(p, out);
    } else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function scanFile(file, text, check) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = text.split("\n");
  const add = (rule, node, snippet) => {
    if (DECOR[file]?.includes(rule)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    for (const l of [lines[line], lines[line - 1]]) {
      const m = l?.match(/ui-allow:\s*([a-z,-]+)/);
      if (m && m[1].split(",").some((r) => r === rule || r === "all")) return;
    }
    hits.push({ rule, file, line: line + 1, snippet: norm(snippet) });
  };
  check(sf, add);
}

// 글자 값(문자열·템플릿 조각) — 색·Tailwind 크기·테두리·버튼 폭
function literalChecks(node, text, add) {
  for (const m of text.matchAll(HEX)) add("color", node, m[0]);
  for (let i = [...text.matchAll(COLOR_FN)].length; i > 0; i--) add("color", node, text);
  for (const m of text.matchAll(TW_COLOR)) add("color", node, m[0]);
  for (const m of text.matchAll(TW_SHADOW)) add("color", node, m[0]);
  for (const m of text.matchAll(TW_SIZE)) {
    const px = m[2] === "xs" ? 12 : Number(m[3]) * (m[4] === "rem" ? 16 : 1);
    if (px < 13) add("size", node, m[0]);
  }
  if (TW_BORDER.test(text)) add("border", node, text);
  if (BAR_BTN.test(text) && BAR_WIDE.test(text)) add("bar", node, text);
}

function smallFontSize(init) {
  if (!init) return null;
  if (ts.isParenthesizedExpression(init)) return smallFontSize(init.expression);
  if (ts.isConditionalExpression(init)) return smallFontSize(init.whenTrue) ?? smallFontSize(init.whenFalse);
  if (ts.isNumericLiteral(init)) return Number(init.text) < 13 ? `fontSize: ${init.text}` : null;
  if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
    const t = init.text.trim();
    const m = t.match(/^(\d*\.?\d+)(px|rem)$/);
    if (!m) return null;
    return Number(m[1]) * (m[2] === "rem" ? 16 : 1) < 13 ? `fontSize: "${t}"` : null;
  }
  return null;
}

const textOf = (n) => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : ts.isTemplateExpression(n) ? n.getText() : null);

function screenCheck(file) {
  return (sf, add) => {
    const koJsx = !KO_JSX_OK.some((re) => re.test(file));
    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (!ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) literalChecks(node, node.text, add);
      } else if (ts.isTemplateExpression(node)) {
        const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ");
        literalChecks(node, parts, add);
        if (/HTTP \$\{/.test(node.getText())) add("raw-error", node, node.getText());
      }
      if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
        const key = node.name.text;
        const init = node.initializer;
        if (key === "fontSize") {
          const s = smallFontSize(init);
          if (s) add("size", node, s);
        } else if (key === "fontFamily") {
          const t = textOf(init);
          if (t != null && !/^\s*(?:var\(--font-|inherit\b)/.test(t)) add("font", node, `fontFamily: ${t}`);
        } else if (key === "border" || key === "outline") {
          const t = textOf(init);
          if (t && BORDER_VALUE.test(t)) add("border", node, `${key}: ${t}`);
        } else if (key === "boxShadow") {
          const t = textOf(init);
          if (t && RING_VALUE.test(t)) add("border", node, `boxShadow: ${t}`);
        }
      }
      // 서버 실패 응답은 { error, code, field }(lib/apiError) — message를 읽으면 늘 비어 기본 문구만 남는다
      if (ts.isPropertyAccessExpression(node) && node.name.text === "message" && ts.isIdentifier(node.expression) && RESP.has(node.expression.text)) {
        add("raw-error", node, node.getText());
      }
      if (koJsx) {
        if (ts.isJsxText(node) && HANGUL.test(node.text)) add("ko-jsx", node, node.text);
        if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && HANGUL.test(node.initializer.text)) {
          add("ko-jsx", node, `${node.name.getText()}="${node.initializer.text}"`);
        }
        if (ts.isJsxExpression(node) && node.expression && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression)) && HANGUL.test(node.expression.text)) {
          add("ko-jsx", node, node.expression.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  };
}

// 사전 — 키 경로를 따라 내려가며 글자마다 말투·이름을 본다
function dictCheck(lang) {
  return (sf, add) => {
    const visit = (node, path) => {
      if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
        visit(node.initializer, path ? `${path}.${node.name.text}` : node.name.text);
        return;
      }
      const texts = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? [node.text]
        : ts.isTemplateExpression(node) ? [node.head.text, ...node.templateSpans.map((s) => s.literal.text)] : null;
      if (texts && path) {
        const text = texts.join("…");
        const nameOk = NAME_OK.some((re) => re.test(path));
        if (lang === "ko") {
          if (TONE.test(text) || HONORIFIC.test(text)) add("tone", node, `${path}: ${text}`);
          if (!nameOk && /명함/.test(text)) add("name", node, `${path}: ${text}`);
        } else if (!nameOk && NAME_EN.test(text)) add("name", node, `${path}: ${text}`);
      }
      ts.forEachChild(node, (c) => visit(c, path));
    };
    visit(sf, "");
  };
}

const files = [...walk("app"), ...walk("components")].filter((f) => !SKIP.some((re) => re.test(f))).sort();
for (const f of files) scanFile(f, readFileSync(f, "utf8"), screenCheck(f));
scanFile("lib/i18n/dictionaries/ko.ts", readFileSync("lib/i18n/dictionaries/ko.ts", "utf8"), dictCheck("ko"));
scanFile("lib/i18n/dictionaries/en.ts", readFileSync("lib/i18n/dictionaries/en.ts", "utf8"), dictCheck("en"));

const keyOf = (h) => `${h.rule}|${h.file}|${h.snippet}`;
const current = {};
for (const h of hits) current[keyOf(h)] = (current[keyOf(h)] ?? 0) + 1;
const totals = (counts) => {
  const out = Object.fromEntries(Object.keys(RULES).map((r) => [r, 0]));
  for (const [k, n] of Object.entries(counts)) out[k.split("|")[0]] += n;
  return out;
};
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")).hits ?? {} : null;

if (MODE === "list") {
  for (const rule of Object.keys(RULES)) {
    const rs = hits.filter((h) => h.rule === rule);
    console.log(`\n## ${rule} (${rs.length}) — ${RULES[rule]}`);
    for (const h of rs) console.log(`  ${h.file}:${h.line}  ${h.snippet}`);
  }
  process.exit(0);
}

if (MODE === "write") {
  const now = totals(current);
  if (base) {
    const was = totals(base);
    const grew = Object.keys(RULES).filter((r) => now[r] > was[r]);
    if (grew.length) {
      console.log(`✗ 기준선은 줄일 때만 다시 쓴다 — 늘어난 규칙: ${grew.map((r) => `${r} ${was[r]}→${now[r]}`).join(", ")}`);
      console.log("  새 어긋남은 고치거나, 맞는 예외면 그 줄에 `ui-allow: <규칙> <까닭>`을 적는다(docs/ui-rules.md).");
      process.exit(1);
    }
  }
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify({
    note: "화면·글 기준(docs/ui-rules.md) 기계 검사의 기준선 — 여기 적힌 어긋남은 봐준다. 고쳐서 줄었을 때만 `npm run ui:baseline`으로 다시 쓴다(늘리는 쓰기는 거절된다).",
    totals: now,
    hits: sorted,
  }, null, 1) + "\n");
  console.log(`✓ 기준선을 썼어요 — ${Object.entries(now).map(([r, n]) => `${r} ${n}`).join(" · ")}`);
  process.exit(0);
}

// 검사 — 기준선보다 많아진 것만 실패
if (!base) {
  console.log(`✗ 기준선(${BASELINE})이 없다 — npm run ui:baseline으로 처음 한 번 만든다.`);
  process.exit(1);
}
const fresh = [];
const left = { ...base };
for (const h of hits) {
  const k = keyOf(h);
  if ((left[k] ?? 0) > 0) left[k]--;
  else fresh.push(h);
}
const fixed = Object.values(left).reduce((a, b) => a + b, 0);
if (fresh.length) {
  console.log(`✗ 화면·글 기준(docs/ui-rules.md)에 새로 어긋난 곳 ${fresh.length}개`);
  for (const h of fresh) console.log(`  ${h.file}:${h.line}  [${h.rule}] ${h.snippet}\n      → ${RULES[h.rule]}`);
  console.log("  고치거나, 맞는 예외면 그 줄에 `// ui-allow: <규칙> <까닭>`을 적는다.");
  process.exit(1);
}
console.log(`✓ 새 어긋남 없음 (기준선 ${Object.values(base).reduce((a, b) => a + b, 0)}곳${fixed ? ` · 그중 ${fixed}곳은 고쳐졌어요 — npm run ui:baseline으로 굳히기` : ""})`);
