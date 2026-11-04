// 매일 밈 — 밤 작업이 올리는 후보를 검사하는 순수 규칙(2026-11-04). 네트워크·DB 없음.
// 라우트(app/api/worker/memes)와 단위 프로브(scripts/probe-meme-submit-unit.mts)가 함께 쓴다.
//
// 이 길로 들어오는 건 전부 '대기(pending)'다 — 상태 칸은 받지도 않는다. 공개는 주인이
// /admin/memes에서 하나씩 승인할 때만. 글 칸은 화면에 타이핑으로 뜨므로 한 줄짜리 보통
// 글자만 받고(줄바꿈·제어 문자·양방향 제어 문자 거절), 근거 칸(jsonb)은 크기만 묶는다.

export const MEME_MAX_LINES = 40;
export const MEME_TEXT_MAX = 120;
export const MEME_REPLACES_MAX = 200;
export const MEME_REASON_MAX = 500;
export const MEME_JSON_FIELD_MAX = 16 * 1024; // 근거 한 칸(직렬화 바이트)

export type MemeLang = "ko" | "en";
export type MemeAudience = "logged_in" | "everyone";
export type MemeKind = "new" | "refresh";
export type MemeRunStatus = "ok" | "skipped" | "failed";

export interface MemeLineInput {
  lang: MemeLang;
  audience: MemeAudience;
  kind: MemeKind;
  text: string;
  reply: string | null;
  replaces: string | null;
  source: Record<string, unknown> | null;
  trend: Record<string, unknown> | null;
  sensitivity: Record<string, unknown>;
  sensitivity_score: number;
}

export interface MemeRunInput {
  run_date: string;
  status: MemeRunStatus;
  reason: string | null;
  usage: Record<string, unknown> | null;
  counts: Record<string, unknown> | null;
}

export type MemeParse =
  | { ok: true; run: MemeRunInput; lines: MemeLineInput[] }
  | { ok: false; field: string; message: string };

// 줄바꿈·탭·제어 문자(C0·DEL·C1)와 글자 방향을 뒤집는 보이지 않는 문자(Trojan Source류)
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function cleanLine(v: unknown, max: number): string | null | "bad" {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return "bad";
  const s = v.normalize("NFC").trim();
  if (!s || s.length > max || BAD_CHARS.test(s)) return "bad";
  return s;
}

function jsonField(v: unknown): Record<string, unknown> | null | "bad" {
  if (v === undefined || v === null) return null;
  if (!isObj(v)) return "bad";
  let size: number;
  try {
    size = Buffer.byteLength(JSON.stringify(v), "utf8");
  } catch {
    return "bad";
  }
  return size > MEME_JSON_FIELD_MAX ? "bad" : v;
}

function validDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseMemeSubmission(body: unknown): MemeParse {
  const fail = (field: string, message: string): MemeParse => ({ ok: false, field, message });
  if (!isObj(body)) return fail("body", "body must be an object");
  const run = body.run;
  if (!isObj(run)) return fail("run", "run is required");
  if (!validDate(run.run_date)) return fail("run.run_date", "run_date must be YYYY-MM-DD");
  if (run.status !== "ok" && run.status !== "skipped" && run.status !== "failed") {
    return fail("run.status", "run.status must be ok | skipped | failed");
  }
  const reason = cleanLine(run.reason, MEME_REASON_MAX);
  if (reason === "bad") return fail("run.reason", "reason must be one line, at most 500 chars");
  if (run.status !== "ok" && !reason) return fail("run.reason", "a skipped or failed run needs a reason");
  const usage = jsonField(run.usage);
  if (usage === "bad") return fail("run.usage", "usage must be a small object");
  const counts = jsonField(run.counts);
  if (counts === "bad") return fail("run.counts", "counts must be a small object");

  const rawLines = body.lines ?? [];
  if (!Array.isArray(rawLines)) return fail("lines", "lines must be an array");
  if (rawLines.length > MEME_MAX_LINES) return fail("lines", `at most ${MEME_MAX_LINES} lines`);
  if (run.status !== "ok" && rawLines.length > 0) return fail("lines", "only an ok run carries lines");

  const lines: MemeLineInput[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i];
    const at = (f: string) => `lines[${i}].${f}`;
    if (!isObj(l)) return fail(`lines[${i}]`, "line must be an object");
    if (l.lang !== "ko" && l.lang !== "en") return fail(at("lang"), "lang must be ko | en");
    if (l.audience !== "logged_in" && l.audience !== "everyone") {
      return fail(at("audience"), "audience must be logged_in | everyone");
    }
    if (l.kind !== "new" && l.kind !== "refresh") return fail(at("kind"), "kind must be new | refresh");
    const text = cleanLine(l.text, MEME_TEXT_MAX);
    if (text === "bad" || text === null) return fail(at("text"), "text must be one line, 1–120 chars");
    const reply = cleanLine(l.reply, MEME_TEXT_MAX);
    if (reply === "bad") return fail(at("reply"), "reply must be one line, 1–120 chars");
    const replaces = cleanLine(l.replaces, MEME_REPLACES_MAX);
    if (replaces === "bad") return fail(at("replaces"), "replaces must be one line, 1–200 chars");
    if (l.kind === "refresh" && !replaces) return fail(at("replaces"), "a refresh line needs replaces");
    const source = jsonField(l.source);
    if (source === "bad") return fail(at("source"), "source must be a small object");
    const trend = jsonField(l.trend);
    if (trend === "bad") return fail(at("trend"), "trend must be a small object");
    // 민감도 검사는 빠질 수 없다 — 검사 안 된 줄은 검토 대기열에도 못 들어온다.
    const sensitivity = jsonField(l.sensitivity);
    if (sensitivity === "bad" || sensitivity === null) {
      return fail(at("sensitivity"), "sensitivity evidence is required");
    }
    const score = l.sensitivity_score;
    if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 100) {
      return fail(at("sensitivity_score"), "sensitivity_score must be an integer 0–100");
    }
    lines.push({
      lang: l.lang, audience: l.audience, kind: l.kind, text, reply, replaces,
      source, trend, sensitivity, sensitivity_score: score,
    });
  }

  return {
    ok: true,
    run: { run_date: run.run_date, status: run.status, reason, usage, counts },
    lines,
  };
}

// 같은 말·같은 문구(답글 포함)는 한 번만 — DB 고유 색인(meme_lines_unique_text)과 같은 열쇠.
export const memeKey = (l: { lang: string; text: string; reply: string | null }) =>
  `${l.lang}\u0000${l.text}\u0000${l.reply ?? ""}`;
