// 매일 밈 밤 작업 — 순서대로 돌리는 곳(2026-11-05). launchd가 매일 02:30에 부른다.
//   node run.mjs [--submit] [--force] [--date YYYY-MM-DD]
//     --submit  그날 실행 기록을 서버(/api/worker/memes)에 남긴다(MEME_SECRET: 키체인)
//     --force   사용량 판단을 건너뛴다(손으로 시험할 때만)
//     --gather-only  재료 모으기까지만(Claude 안 부름)
// 단계: 1 사용량 판단 → 2 재료 모으기 → 3 틀 찾기(Claude) + 유행 숫자 → 4 후보 쓰기(Claude)
//       → 5 1차 거르기 → 6 반박 검사(Claude 조사관·판정관) → 7 '대기'로 올리기 + 비용 실측 기록
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import { BASE, appendJsonl, ensureDir, exists, kstDate, log, readJson } from "./util.mjs";
import { decideRun, estimateCost, fetchLimits } from "./usage.mjs";
import { gather } from "./gather.mjs";
import { spotFormats, writeCandidates } from "./compose.mjs";
import { measurePhrase } from "./trend.mjs";
import { filterCandidate, lineKey } from "./filter.mjs";
import { checkAll, fitSensitivity } from "./check.mjs";
import { writeJson } from "./util.mjs";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const date = args.includes("--date") ? args[args.indexOf("--date") + 1] : kstDate();
const ORIGIN = process.env.NF_ORIGIN || "https://nookframe.com";
const HISTORY = join(BASE, "history.jsonl");
const LOCK = join(BASE, "run.lock");
const MAX_WAIT_MS = 5 * 3600_000;
const SUBMITTED = join(BASE, "submitted.jsonl"); // 지금까지 올린 줄(겹침 막기·'최근에 쓴 것' 알려 주기)
const MAX_NEW = 14;
const MAX_REFRESH = 4;

ensureDir(BASE);

function readHistory() {
  if (!exists(HISTORY)) return [];
  return String(execFileSync("tail", ["-n", "30", HISTORY])).split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function memeSecret() {
  return String(execFileSync("security", ["find-generic-password", "-s", "nookframe-meme-secret", "-w"], {
    stdio: ["ignore", "pipe", "ignore"],
  })).trim();
}

async function submit(run, lines = []) {
  if (!flag("--submit")) return log("(기록 안 보냄 — --submit 없음)");
  try {
    const r = await fetch(`${ORIGIN}/api/worker/memes`, {
      method: "POST",
      headers: { authorization: `Bearer ${memeSecret()}`, "content-type": "application/json" },
      body: JSON.stringify({ run: { run_date: date, ...run }, lines }),
    });
    const b = await r.json().catch(() => ({}));
    log(`서버 기록 ${r.status}`, b.ok ? `inserted=${b.inserted} skipped=${b.skipped}` : b.code ?? "");
  } catch (e) {
    log("서버 기록 실패:", e.message);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (exists(LOCK)) {
    const age = Date.now() - (readJson(LOCK)?.at ?? 0);
    if (age < 6 * 3600_000) return log("이미 도는 중(run.lock) — 끝냄");
  }
  writeFileSync(LOCK, JSON.stringify({ at: Date.now(), pid: process.pid }));
  const started = Date.now();
  const record = { date, startedAt: new Date(started).toISOString() };
  try {
    // 1. 사용량 판단
    const cost = estimateCost(readHistory());
    let before = null;
    if (!flag("--force")) {
      try { before = await fetchLimits(); } catch (e) {
        record.decision = { action: "skip", reason: `사용량을 못 읽었어요(${e.message})` };
        log(record.decision.reason);
        await submit({ status: "skipped", reason: record.decision.reason });
        return;
      }
      let d = decideRun({ now: Date.now(), ...before, cost });
      if (d.action === "wait" && d.until - Date.now() <= MAX_WAIT_MS) {
        log(d.reason);
        await sleep(Math.max(0, d.until - Date.now()) + 2 * 60_000);
        before = await fetchLimits();
        d = decideRun({ now: Date.now(), ...before, cost });
      }
      record.decision = d;
      log(`판단: ${d.action} — ${d.reason}`);
      if (d.action !== "run") {
        await submit({ status: "skipped", reason: d.reason, usage: { before, cost, numbers: d.numbers } });
        return;
      }
    }

    // 2. 재료 모으기
    const manifest = await gather(date);
    const okSources = manifest.filter((m) => m.status === 200).length;
    record.gathered = { ok: okSources, total: manifest.length };

    let lines = [];
    let claudeUsed = false;
    const costs = { usd: 0 };
    if (!flag("--gather-only")) {
      claudeUsed = true;
      const dir = join(BASE, "raw", date);
      const existing = readJson(join(BASE, "existing-lines.json"), { lines: [] }).lines;
      const submitted = exists(SUBMITTED)
        ? String(execFileSync("tail", ["-n", "300", SUBMITTED])).split("\n").filter(Boolean).map((l) => JSON.parse(l))
        : [];

      // 3. 오늘 도는 틀 + 유행 숫자(틀마다 한 번씩, 차례로)
      const spot = await spotFormats(date, dir);
      costs.usd += spot.costUsd;
      for (const f of spot.formats) {
        try { f.trend = await measurePhrase(f.searchPhrase, { wikiTitle: f.wikiTitle || undefined }); }
        catch (e) { f.trend = { verdict: "error", error: e.message }; }
      }
      writeJson(join(dir, "_formats.json"), spot);
      log("유행:", spot.formats.map((f) => `${f.name}=${f.trend?.verdict}`).join(" · "));

      // 4. 후보 쓰기
      const w = await writeCandidates({
        date, formats: spot.formats, existing,
        recent: submitted.slice(-60).map((l) => (l.reply ? `${l.text} / ${l.reply}` : l.text)),
      });
      costs.usd += w.costUsd;

      // 5. 1차 거르기 — 형식·겹침·낱말. 최신화는 바꿀 문구가 실제로 있어야.
      const existingKeys = new Set([...existing, ...submitted].map((l) => lineKey({ ...l, lang: l.lang ?? "en" })));
      const existingTexts = new Set(existing.filter((l) => l.lang === "en").map((l) => l.text));
      const kept = [];
      for (const c of w.candidates) {
        const line = { lang: "en", text: c.text.trim(), reply: c.reply?.trim() || null };
        if (c.kind === "refresh" && !existingTexts.has(c.replaces)) { log("최신화 대상 없음 — 뺌:", c.replaces); continue; }
        const f = filterCandidate(line, { existing: existingKeys });
        if (!f.ok) { log("거름:", f.hard.join(","), "—", line.text); continue; }
        existingKeys.add(lineKey(line));
        kept.push({ ...c, ...line, filter: f });
      }
      const rank = (c) => spot.formats.find((f) => f.name === c.format)?.trend?.score ?? 40;
      const news = kept.filter((c) => c.kind === "new").sort((a, b) => rank(b) - rank(a)).slice(0, MAX_NEW);
      const refresh = kept.filter((c) => c.kind === "refresh").slice(0, MAX_REFRESH);
      const toCheck = [...news, ...refresh];
      writeJson(join(dir, "_candidates.json"), { written: w.candidates, kept: toCheck });

      // 6. 반박 검사
      const checked = await checkAll(toCheck, { date, dir, formats: spot.formats });
      costs.usd += checked.cost.usd;
      costs.calls = checked.cost.calls + 2;
      costs.failed = checked.cost.failed;
      writeJson(join(dir, "_checks.json"), checked);

      // 7. 올릴 모양으로
      lines = toCheck.map((c, i) => {
        const s = checked.results[i];
        const f = spot.formats.find((x) => x.name === c.format);
        return {
          lang: "en", audience: c.audience, kind: c.kind, text: c.text, reply: c.reply,
          replaces: c.kind === "refresh" ? c.replaces : null,
          source: f ? { format: f.name, kind: f.kind, description: f.description, sources: f.sources.slice(0, 4), why: c.why } : { why: c.why },
          trend: f?.trend ? { score: f.trend.score, verdict: f.trend.verdict, ratio: f.trend.ratio, phrase: f.trend.phrase, sources: f.trend.sources, window: f.trend.window } : null,
          sensitivity: fitSensitivity({
            score: s.score, level: s.level, floors: s.floors, injected: s.injected, note: s.note,
            categories: s.categories, summaries: s.summaries, judges: s.judges, mechanical: c.filter?.soft ?? [],
          }),
          sensitivity_score: s.score,
        };
      });
      for (const l of lines) appendJsonl(SUBMITTED, { date, lang: l.lang, text: l.text, reply: l.reply });
      log(`올릴 후보 ${lines.length}줄 — 초록 ${lines.filter((l) => l.sensitivity.level === "green").length} · 노랑 ${lines.filter((l) => l.sensitivity.level === "yellow").length} · 빨강 이상 ${lines.filter((l) => ["red", "drop"].includes(l.sensitivity.level)).length}`);
    }

    // 7. 기록 — Claude를 쓴 실행만 비용 실측으로 남긴다(다음 판단의 근거).
    let after = null;
    try { after = flag("--force") ? null : await fetchLimits(); } catch { /* 기록만 비움 */ }
    const minutes = Math.round((Date.now() - started) / 60_000);
    if (claudeUsed && before && after) {
      record.measured = {
        session: Math.max(0, after.session.percent - before.session.percent),
        weekly: Math.max(0, after.weekly.percent - before.weekly.percent),
        minutes,
      };
    }
    record.costs = costs;
    await submit({
      status: "ok",
      reason: claudeUsed ? null : "재료 모으기까지만(--gather-only)",
      usage: { before, after, cost, measured: record.measured ?? null, numbers: record.decision?.numbers ?? null },
      counts: {
        sources_ok: okSources, sources_total: manifest.length, minutes, lines: lines.length,
        claude_calls: costs.calls ?? 0, claude_failed: costs.failed ?? 0, api_equivalent_usd: Math.round(costs.usd * 100) / 100,
      },
    }, lines);
  } catch (e) {
    record.error = String(e?.message ?? e);
    log("실패:", record.error);
    await submit({ status: "failed", reason: record.error.slice(0, 400) });
  } finally {
    record.finishedAt = new Date().toISOString();
    appendJsonl(HISTORY, record);
    rmSync(LOCK, { force: true });
  }
}

await main();
