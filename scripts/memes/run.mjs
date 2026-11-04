// 매일 밈 밤 작업 — 순서대로 돌리는 곳(2026-11-05). launchd가 매일 02:30에 부른다.
//   node run.mjs [--submit] [--force] [--date YYYY-MM-DD]
//     --submit  그날 실행 기록을 서버(/api/worker/memes)에 남긴다(MEME_SECRET: 키체인)
//     --force   사용량 판단을 건너뛴다(손으로 시험할 때만)
// 지금 있는 단계: 1 사용량 판단 → 2 재료 모으기 → (3·4·6 쓰기·검사는 다음 단계에서 붙음) → 7 기록
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { rmSync, writeFileSync } from "node:fs";
import { BASE, appendJsonl, ensureDir, exists, kstDate, log, readJson } from "./util.mjs";
import { decideRun, estimateCost, fetchLimits } from "./usage.mjs";
import { gather } from "./gather.mjs";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const date = args.includes("--date") ? args[args.indexOf("--date") + 1] : kstDate();
const ORIGIN = process.env.NF_ORIGIN || "https://nookframe.com";
const HISTORY = join(BASE, "history.jsonl");
const LOCK = join(BASE, "run.lock");
const MAX_WAIT_MS = 5 * 3600_000;

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

    // 3·4·6 (쓰기·유행 숫자·반박 검사)은 다음 단계에서 이 자리에 붙는다.
    const claudeUsed = false;

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
    await submit({
      status: "ok",
      reason: "시범: 재료 모으기까지만(쓰기·검사 단계 전)",
      usage: { before, after, cost, numbers: record.decision?.numbers ?? null },
      counts: { sources_ok: okSources, sources_total: manifest.length, minutes },
    });
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
