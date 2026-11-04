// 매일 밈 밤 작업 — 반박 검사(2026-11-05, 설계 D-sensitivity-check.md).
//   조사관(서로 모르는 따로 뜬 claude -p): A 우리 줄 · A' 줄이 떠올리게 하는 것 · B 원본 밈(7일 재사용) · C 오늘(하루 1번)
//   판정관(도구 없음): 11칸 점수 → 코드가 합침(평균 아님, 최댓값) — 점수는 올라가기만 한다.
//   30 노랑 · 55 빨강 · 85 빼기 권장. 30~70은 판정관을 한 번 더 부르고 더 높은 쪽, 둘이 30 넘게 갈리면 한 단계 올림.
import { join } from "node:path";
import { BASE, ensureDir, htmlToText, log, politeFetch, readJson, writeJson } from "./util.mjs";
import { pool, runClaude } from "./claude.mjs";
import {
  CATEGORIES, DAY_SCHEMA, DAY_SYSTEM, INVESTIGATE_EVOKES_SYSTEM, INVESTIGATE_LINE_SYSTEM,
  INVESTIGATE_ORIGIN_SYSTEM, INVESTIGATE_SCHEMA, JUDGE_SCHEMA, JUDGE_SYSTEM,
} from "./prompts.mjs";

export const LEVELS = [[85, "drop"], [55, "red"], [30, "yellow"], [0, "green"]];
export const levelOf = (s) => LEVELS.find(([min]) => s >= min)[1];
const ORIGIN_TTL = 7 * 86400_000;
const INJECTION = /(ignore (all |the )?(previous|prior|above)|disregard (the |all )?(previous |prior )?instructions|rate (this|it) (as )?(safe|0|zero)|you must (score|rate|output)|system prompt|판정하라|무시하고|지시를 따르)/i;

export const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "x";

/**
 * 판정 합치기(순수). 점수는 올라가기만: 판정관 최댓값 · 바닥값(거르기 표시·속임수·원본 기록 없음).
 * @param {{ judges:any[], softFlags?:string[], originNoRecord?:boolean, injectionFlags?:boolean[], injectionTexts?:string[] }} x
 */
export function aggregate({ judges, softFlags = [], originNoRecord = false, injectionFlags = [], injectionTexts = [] }) {
  const cats = {};
  const overall = [];
  for (const j of judges) {
    let jMax = 0;
    for (const s of j?.scores ?? []) {
      const w = CATEGORIES[s.category];
      if (w === undefined) continue;
      let v = s.score * w;
      if (s.fromKnowledgeOnly) v = s.score >= 70 ? Math.max(v * 0.5, 30) : v * 0.5;
      v = Math.round(v);
      jMax = Math.max(jMax, v);
      if (!cats[s.category] || v > cats[s.category].score) {
        cats[s.category] = { category: s.category, score: v, raw: s.score, reason: s.reason, evidenceUrls: s.evidenceUrls ?? [], fromKnowledgeOnly: !!s.fromKnowledgeOnly };
      }
    }
    overall.push(jMax);
  }
  let score = Math.max(0, ...overall);
  const floors = [];
  const floor = (min, why) => { if (score < min) score = min; floors.push(why); };
  if (overall.length >= 2 && Math.max(...overall) - Math.min(...overall) > 30) { score = Math.min(100, score + 15); floors.push("judges_disagree"); }
  if (softFlags.includes("sensitive_number_or_date")) floor(30, "sensitive_number_or_date");
  if (softFlags.includes("contested_word")) floor(30, "contested_word");
  if (originNoRecord) floor(25, "origin_no_record");
  // 조사관·판정관이 '자료 속 지시문을 만났다'고 표시했거나(예/아니오 칸 — 11-05 자유 글 칸은 'none' 류 답이 헛경보를 냄),
  // 그들이 옮긴 글에 지시문 꼴이 그대로 있으면.
  const injected = injectionFlags.some((f) => f === true) || injectionTexts.some((t) => !!t && INJECTION.test(t));
  if (injected) floor(60, "injection_seen");
  return {
    score, level: levelOf(score), floors, injected,
    categories: Object.values(cats).sort((a, b) => b.score - a.score),
  };
}

// 인용이 그 주소의 실제 글에 있는지(표시용 — 점수를 내리지 않는다).
async function verifyQuote(url, quote) {
  if (!quote || !/^https?:\/\//.test(url)) return null;
  const r = await politeFetch(url, { timeoutMs: 15_000 });
  if (!r.ok) return null;
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(htmlToText(r.body)).includes(norm(quote).slice(0, 80));
}

const injectionOf = (outs) => ({
  injectionFlags: outs.map((o) => o?.injectionFound === true),
  injectionTexts: outs.map((o) => o?.injectionDetail ?? ""),
});
const lineText = (c) => (c.reply ? `${c.text}\n↳ ${c.reply}` : c.text);
const data = (o) => `<data>\n${JSON.stringify(o, null, 2)}\n</data>`;
const investigate = (system, subject) =>
  runClaude({ system, schema: INVESTIGATE_SCHEMA, tools: ["WebSearch", "WebFetch"], model: "sonnet", effort: "medium", prompt: subject });

export async function checkAll(candidates, { date, dir, formats = [] }) {
  const cost = { usd: 0, calls: 0, failed: 0 };
  const track = (r) => { cost.calls++; cost.usd += r.costUsd ?? 0; if (!r.ok) cost.failed++; return r; };

  // C — 오늘(하루 한 번)
  const dayPath = join(dir, "day.json");
  let day = readJson(dayPath);
  if (!day) {
    const r = track(await runClaude({
      system: DAY_SYSTEM, schema: DAY_SCHEMA, tools: ["WebSearch", "WebFetch"], model: "sonnet", effort: "medium",
      prompt: `Today is ${date} (Korea Standard Time). What makes today sensitive for light jokes?`,
    }));
    day = r.ok ? r.data : { events: [], error: r.error };
    writeJson(dayPath, day);
  }

  // B — 원본 밈(형식별, 7일 재사용)
  const originDir = ensureDir(join(BASE, "cache", "origin"));
  const origins = {};
  const used = [...new Set(candidates.map((c) => c.format).filter(Boolean))];
  await pool(used, 3, async (name) => {
    const p = join(originDir, `${slug(name)}.json`);
    const cached = readJson(p);
    if (cached && Date.now() - cached.at < ORIGIN_TTL) return (origins[name] = cached.result);
    const f = formats.find((x) => x.name === name);
    const r = track(await investigate(INVESTIGATE_ORIGIN_SYSTEM, `Meme format to investigate:\n${data({ name, description: f?.description ?? "", example: f?.example ?? "" })}`));
    origins[name] = r.ok ? r.data : null;
    if (r.ok) writeJson(p, { at: Date.now(), result: r.data });
  });

  // A·A' — 줄마다, 그리고 판정
  const results = await pool(candidates, 3, async (c) => {
    const subject = `Text to investigate:\n${data({ text: lineText(c) })}`;
    const [a, a2] = await Promise.all([
      investigate(INVESTIGATE_LINE_SYSTEM, subject).then(track),
      investigate(INVESTIGATE_EVOKES_SYSTEM, subject).then(track),
    ]);
    const bundle = {
      candidate: { text: c.text, reply: c.reply || null, audience: c.audience, shownAs: lineText(c) },
      investigation_line: a.ok ? a.data : { error: a.error },
      investigation_echoes: a2.ok ? a2.data : { error: a2.error },
      investigation_original_meme: c.format ? origins[c.format] ?? { error: "not investigated" } : null,
      today: day.events ?? [],
      mechanical_flags: c.filter?.soft ?? [],
    };
    const judge = () => runClaude({
      system: JUDGE_SYSTEM, schema: JUDGE_SCHEMA, tools: [], model: "opus", effort: "high",
      prompt: `Score this candidate.\n${data(bundle)}`,
    }).then(track);
    const judges = [];
    const j1 = await judge();
    if (j1.ok) judges.push(j1.data);
    let agg = aggregate({
      judges, softFlags: c.filter?.soft, originNoRecord: !!origins[c.format]?.noRecord,
      ...injectionOf([a.data, a2.data, origins[c.format], j1.data]),
    });
    if (!j1.ok || (agg.score >= 30 && agg.score <= 70)) {
      const j2 = await judge();
      if (j2.ok) judges.push(j2.data);
      agg = aggregate({
        judges, softFlags: c.filter?.soft, originNoRecord: !!origins[c.format]?.noRecord,
        ...injectionOf([a.data, a2.data, origins[c.format], ...judges]),
      });
    }
    if (!judges.length) agg = { ...agg, score: Math.max(agg.score, 60), level: levelOf(Math.max(agg.score, 60)), floors: [...agg.floors, "judge_failed"] };

    // 근거 붙이기: 30점 넘는 칸의 인용을 조사 결과에서 찾아 붙이고, 실제 글에 있는지 확인(최대 3개)
    const allEvidence = [a.data, a2.data, origins[c.format]].flatMap((x) => (x?.findings ?? []).flatMap((f) => f.evidence ?? []));
    let checked = 0;
    for (const cat of agg.categories) {
      cat.evidence = [];
      if (cat.score < 30) continue;
      for (const url of cat.evidenceUrls.slice(0, 2)) {
        const ev = allEvidence.find((e) => e.url === url) ?? { url, quote: "", date: "" };
        const verified = checked < 3 ? await verifyQuote(ev.url, ev.quote) : null;
        if (verified !== null) checked++;
        cat.evidence.push({ url: ev.url, quote: (ev.quote ?? "").slice(0, 200), date: ev.date ?? "", verified });
      }
    }
    return {
      ...agg,
      note: judges[0]?.note ?? "",
      summaries: {
        line: a.data?.summary?.slice(0, 400) ?? `(failed: ${a.error})`,
        echoes: a2.data?.summary?.slice(0, 400) ?? `(failed: ${a2.error})`,
        origin: c.format ? origins[c.format]?.summary?.slice(0, 400) ?? "(not investigated)" : null,
      },
      judges: judges.length,
      // 맥에만 남기는 원본(서버로 안 보냄) — 점수가 왜 그렇게 나왔는지 되짚을 때
      debug: { line: a.data ?? a.error, echoes: a2.data ?? a2.error, judges },
    };
  });
  log(`반박 검사: 후보 ${candidates.length} · Claude 호출 ${cost.calls}(실패 ${cost.failed}) · API로 쳤다면 약 $${cost.usd.toFixed(2)}`);
  return { results, day, cost };
}

// jsonb 칸 상한(16KB)에 맞춘다 — 넘으면 근거 인용부터 덜어 낸다.
export function fitSensitivity(s, max = 15_000) {
  const size = (o) => Buffer.byteLength(JSON.stringify(o), "utf8");
  let o = JSON.parse(JSON.stringify(s));
  if (size(o) <= max) return o;
  for (const c of o.categories) c.reason = (c.reason ?? "").slice(0, 200);
  if (size(o) <= max) return o;
  o.categories = o.categories.filter((c) => c.score >= 10);
  if (size(o) <= max) return o;
  for (const c of o.categories) for (const e of c.evidence ?? []) e.quote = e.quote.slice(0, 80);
  if (size(o) <= max) return o;
  o.categories = o.categories.slice(0, 4);
  return o;
}
