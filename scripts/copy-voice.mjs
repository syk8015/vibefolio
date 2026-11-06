// 영어 말투 검사기(2026-11-06, docs/brand.md §11 '영어 말투 기준' + docs/banned-words.json).
// 한 줄 글을 받아 어긋남 목록을 돌려준다. 쓰는 곳 두 군데:
//   - scripts/probe-copy-voice.mjs(npm test) — 화면 글·홈 문구가 새로 어긋나지 않게
//   - scripts/memes/filter.mjs — 매일 밈 후보 1차 거르기
// 낱말 목록은 docs/banned-words.json 한 장뿐이다. 여기에 낱말을 따로 적지 말 것.
import { readFileSync } from "node:fs";

const DATA = JSON.parse(readFileSync(new URL("../docs/banned-words.json", import.meta.url), "utf8"));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// 낱말 그대로 → 앞뒤가 글자가 아닐 때만, 띄어쓰기는 몇 칸이든
const wordRx = (w) => `(?<![\\p{L}\\p{N}])${esc(w).replace(/-/g, "[-\\s]?").replace(/ +/g, "\\s+")}(?![\\p{L}\\p{N}])`;

export const WORD_RULES = DATA.rules
  .filter((r) => r.check === "auto" && !r.mechanical && (r.words.length || r.regex.length))
  .map((r) => ({
    id: r.id,
    level: r.level,
    label: r.label,
    instead: r.instead,
    rx: new RegExp([...r.words.map(wordRx), ...r.regex].join("|"), r.caseSensitive ? "u" : "iu"),
  }));

// 기계로 재는 문장부호·모양(§11 문장부호·대문자)
const DASH = /—|\s–\s/; // 줄표(em dash), 띄어 쓴 en dash도 같은 역할
const BANG = /(?<!<)!(?!=)/; // <!doctype html>·!= 같은 코드 조각은 빼고
const DOTS = /\.\.\./; // 말줄임은 글자 하나 '…'
const EMOJI = /\p{Emoji_Presentation}|\uFE0F/u; // ™·↗·↳ 같은 글자 기호는 괜찮다
const PLACEHOLDER = /\[(?:your|insert|name|company)[^\]]*\]|\bINSERT_|\blorem ipsum\b|\b20\d\d-XX\b/i; // TODO는 개발 농담에 쓰여서 뺀다
const NOT_NOT = /\bnot [^.]{1,30}\.\s+not [^.]{1,30}\.|\bno [\w\s']{1,20}, no [\w\s']{1,20}, just\b/i;
// 끝 마침표: '.' 하나로 끝남(말줄임 '…'·'..'은 아님). 따옴표·괄호 뒤도 본다.
const TERMINAL_PERIOD = /(?:^|[^.])\.["'”’)]*$/;
// 첫 글자만 대문자(sentence case) — 낱말 3개 이상이 전부 대문자로 시작하면 Title Case로 본다.
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs", "via", "with", "from"]);
function isTitleCase(s) {
  if (/[(/]/.test(s)) return false; // "Android (Kotlin/Gradle)" 같은 이름 목록
  const words = s.replace(/\{[^}]*\}|\$\{[^}]*\}/g, " ").match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  const big = words.filter((w) => !SMALL.has(w.toLowerCase()) && !(w.length > 1 && w === w.toUpperCase())); // API·TODO 같은 대문자 낱말은 이름으로 본다
  if (big.length < 3) return false;
  return big.every((w) => /^[A-Z]/.test(w));
}
const countWords = (s) => (s.replace(/\$\{[^}]*\}|\{[^}]*\}/g, "N").match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;

// 자리별 단어 수 상한(§11 길이 상한)
export const WORD_CAPS = { intro: 9, home: 9, loggedIn: 12, promo: 8, button: 3, title: 6 };

export const RULE_NAMES = {
  word: "쓰지 않는 낱말(docs/banned-words.json, 금지)",
  name: "이름은 어디서나 소문자 nookframe",
  dash: "줄표(—) 금지 — 쉼표나 두 문장으로",
  period: "끝 마침표 금지(긴 메일·약관·문서·AI용 오류만 예외)",
  bang: "느낌표 금지",
  dots: "말줄임은 '…' 한 글자로",
  emoji: "이모지 금지",
  "title-case": "첫 글자만 대문자(Title Case 금지, 이름은 예외)",
  placeholder: "남은 자리표시([Your Name]·TODO·lorem ipsum)",
  "not-not": "부정 나열(Not X. Not Y.) — 남길 것만 말하기",
  length: "자리별 단어 수 상한 초과",
  warn: "경고 낱말(뜻이 여럿 — 사람이 본다)",
};

/**
 * @param {string} text 한 줄 영어 글
 * @param {{ cap?: number, period?: boolean }} opts cap = 단어 수 상한, period=false면 끝 마침표를 보지 않음(긴 글)
 * @returns {{ rule: string, id?: string, level: "block"|"warn", hit?: string }[]}
 */
export function checkEnglish(text, { cap, period = true } = {}) {
  const s = String(text ?? "").replace(/[’‘]/g, "'").trim();
  const out = [];
  if (!s) return out;
  const seen = new Set(); // 두 조사 목록에 같은 낱말이 있으면 처음 것 하나만
  for (const r of WORD_RULES) {
    const m = s.match(r.rx);
    if (!m || seen.has(m[0].toLowerCase())) continue;
    seen.add(m[0].toLowerCase());
    const rule = r.id === "N05" ? "name" : r.level === "block" ? "word" : "warn";
    out.push({ rule, id: r.id, level: r.level, hit: m[0] });
  }
  if (DASH.test(s)) out.push({ rule: "dash", level: "block" });
  if (BANG.test(s)) out.push({ rule: "bang", level: "block" });
  if (DOTS.test(s)) out.push({ rule: "dots", level: "block" });
  if (EMOJI.test(s)) out.push({ rule: "emoji", level: "block" });
  if (PLACEHOLDER.test(s)) out.push({ rule: "placeholder", level: "block" });
  if (NOT_NOT.test(s)) out.push({ rule: "not-not", level: "block" });
  if (period && TERMINAL_PERIOD.test(s)) out.push({ rule: "period", level: "block" });
  if (isTitleCase(s)) out.push({ rule: "title-case", level: "block" });
  if (cap && countWords(s) > cap) out.push({ rule: "length", level: "block", hit: `${countWords(s)}>${cap}` });
  return out;
}

export { countWords, isTitleCase };

// 글쓰기 AI에게 그대로 줄 규칙 글(매일 밈 등). 금지 낱말 전부 + 문장부호.
export function promptRules() {
  const block = DATA.rules.filter((r) => r.level === "block" && r.check === "auto" && !r.mechanical && r.words.length).flatMap((r) => r.words);
  const read = DATA.rules.filter((r) => r.level === "block" && (r.check === "read" || r.regex.length)).map((r) => r.label);
  return (
    "House style (strict, checked by a machine afterwards):\n" +
    "- The product name is always lowercase: nookframe, even at the start of a sentence.\n" +
    "- No terminal period. No em dash or spaced en dash. No exclamation mark. Ellipsis only as the single character … and only for a pause.\n" +
    "- Sentence case only (no Title Case). No emoji. Use contractions and say you.\n" +
    `- Never use these words or phrases: ${[...new Set(block.map((w) => w.toLowerCase()))].join(", ")}.\n` +
    `- Also avoid these shapes: ${read.join(" · ")}.\n`
  );
}
