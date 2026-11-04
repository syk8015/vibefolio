// 매일 밈 밤 작업 — 오늘 도는 틀 찾기(3a) + 후보 쓰기(4)(2026-11-05). 영어부터.
import { join } from "node:path";
import { readdirSync } from "node:fs";
import { log, readJson } from "./util.mjs";
import { runClaude } from "./claude.mjs";
import { SPOT_SCHEMA, SPOT_SYSTEM, WRITE_SCHEMA, WRITE_SYSTEM } from "./prompts.mjs";

const PER_SOURCE_TEXT = 6_000;

// raw/<날짜>/*.json → AI에게 줄 압축본(출처별 링크 제목 + 글 앞부분 + 항목).
export function digestRaw(dir) {
  const out = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x !== "manifest.json" && !x.startsWith("_"))) {
    const d = readJson(join(dir, f));
    if (!d || d.status !== 200 || d.id === "imgflip") continue;
    out.push({
      source: d.id, url: d.url,
      links: (d.links ?? []).slice(0, 40).map((l) => `${l.title} — ${l.url}`),
      text: (d.text ?? "").slice(0, PER_SOURCE_TEXT),
      items: (d.items ?? []).slice(0, 40).map((i) => i.title ?? i.text),
    });
  }
  // 밈 그림 틀 순위(상위 25)
  const img = readJson(join(dir, "imgflip.json"));
  if (img?.items) out.push({ source: "imgflip-top-templates", items: img.items.slice(0, 25).map((m) => `#${m.rank} ${m.name}`) });
  return out;
}

export async function spotFormats(date, dir) {
  const r = await runClaude({
    system: SPOT_SYSTEM, schema: SPOT_SCHEMA, tools: ["WebSearch", "WebFetch"], model: "sonnet", effort: "medium",
    prompt: `Today is ${date}. Below is what was collected tonight from meme and tech sources. ` +
      `Find up to 12 formats that are spreading right now and could be remixed into jokes about building and showing apps made with AI. ` +
      `You may run a few web searches to confirm a format is recent.\n<data>\n${JSON.stringify(digestRaw(dir))}\n</data>`,
  });
  if (!r.ok) throw new Error(`spot: ${r.error}`);
  log(`틀 ${r.data.formats.length}개 찾음 (약 $${(r.costUsd ?? 0).toFixed(2)})`);
  return { formats: r.data.formats, injectionSeen: r.data.injectionSeen ?? "", costUsd: r.costUsd ?? 0 };
}

export async function writeCandidates({ date, formats, existing, recent }) {
  const en = existing.filter((l) => l.lang === "en");
  const r = await runClaude({
    system: WRITE_SYSTEM, schema: WRITE_SCHEMA, tools: [], model: "opus", effort: "high",
    prompt:
      `Today is ${date}.\n` +
      `Write 14 NEW candidates (kind "new"): about 9 for "logged_in" (builders) and 5 for "everyone" (first-time visitors). ` +
      `Prefer formats whose trend verdict is "rising" or "alive"; "insufficient" means only social evidence. Each should remix one format and name it.\n` +
      `Then write up to 4 REFRESH candidates (kind "refresh"): pick existing lines that feel dated (2023–24 era tools, ` +
      `old model habits like Stack Overflow vs ChatGPT, autocomplete-era jokes) and rewrite them for today's agent-driven AI coding. ` +
      `"replaces" must be the exact text of the existing line; keep the same audience as its pool (logged_out → everyone, logged_in → logged_in).\n` +
      `Do not repeat or closely paraphrase any existing line or any recently written line.\n` +
      `<data>\n${JSON.stringify({ trending_formats: formats, existing_lines: en.map((l) => ({ pool: l.pool, text: l.text, reply: l.reply })), recently_written: recent })}\n</data>`,
  });
  if (!r.ok) throw new Error(`write: ${r.error}`);
  log(`후보 ${r.data.candidates.length}개 씀 (약 $${(r.costUsd ?? 0).toFixed(2)})`);
  return { candidates: r.data.candidates, costUsd: r.costUsd ?? 0 };
}
