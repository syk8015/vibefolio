// 매일 밈 밤 작업 — 공용 도구(2026-11-05). 의존성 없음(Node 내장만): launchd가 이 폴더의
// 사본을 ~/Library/Application Support/Nookframe/memes/에서 돌리므로 레포의 node_modules를 못 본다.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const BASE = process.env.NF_MEMES_DIR || join(homedir(), "Library/Application Support/Nookframe/memes");
export const UA = "NookframeMemeBot/0.1 (+https://nookframe.com/security)";

export const ensureDir = (p) => (mkdirSync(p, { recursive: true }), p);
export const readJson = (p, fallback = null) => {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return fallback; }
};
export const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
export const appendJsonl = (p, v) => appendFileSync(p, JSON.stringify(v) + "\n");
export const exists = existsSync;

// 한국 시간 날짜(YYYY-MM-DD). 밤 작업의 '그날'은 늘 한국 날짜다.
export function kstDate(ms = Date.now()) {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

export function log(...a) {
  console.log(`[memes ${new Date().toISOString().slice(11, 19)}]`, ...a);
}

// 한 곳에 한 번만, 정직한 이름으로, 짧게 기다린다. 403·429는 다시 두드리지 않는다(실패로 기록).
export async function politeFetch(url, { timeoutMs = 20_000, maxBytes = 2_000_000, accept } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { "user-agent": UA, ...(accept ? { accept } : {}) },
      redirect: "follow",
      signal: ctrl.signal,
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const body = buf.subarray(0, maxBytes).toString("utf8");
    return { ok: r.ok, status: r.status, type: r.headers.get("content-type") ?? "", body, truncated: buf.length > maxBytes };
  } catch (err) {
    return { ok: false, status: 0, type: "", body: "", error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k];
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
    if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10) || 32);
    return m;
  });
}

// HTML → 읽을 글. 스크립트·스타일·주석은 통째로 버린다(AI가 읽을 재료에 코드가 섞이지 않게).
export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|p|div|li|h[1-6]|tr|article|section)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// 같은 사이트의 글 링크만(제목, 주소). 메뉴·로그인·광고 링크는 짧은 제목·패턴으로 거른다.
export function extractLinks(html, baseUrl, { pathPattern, max = 80 } = {}) {
  const out = [];
  const seen = new Set();
  const base = new URL(baseUrl);
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let u;
    try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
    if (u.host !== base.host) continue;
    if (pathPattern && !pathPattern.test(u.pathname)) continue;
    const title = htmlToText(m[2]).replace(/\s+/g, " ").trim();
    if (title.length < 8 || title.length > 200) continue;
    const key = u.origin + u.pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url: key });
    if (out.length >= max) break;
  }
  return out;
}
