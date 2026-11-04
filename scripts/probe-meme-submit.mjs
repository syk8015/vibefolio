// 매일 밈 — 밤 작업이 후보를 넣는 길(/api/worker/memes, 2026-11-04) prod E2E.
//   (1) 열쇠: 없음·틀림·워커 비밀 → 401 (MEME_SECRET만 통과)
//   (2) 모양: 잘못된 본문 → 400 BAD_REQUEST + 어느 칸인지
//   (3) 넣기: 들어간 줄은 늘 '대기' — 보낸 status는 무시, 같은 묶음 안 겹침은 1번만
//   (4) 다시 보내기: 이미 있는 문구는 건너뜀(고유 색인)
//   (5) 익명 키로는 두 표 다 못 읽음(기본 거부)
// 남기는 것 없음 — 시험 줄·실행 기록은 끝에 서비스 키로 지운다.
// 사용: node scripts/probe-meme-submit.mjs   (MEME_SECRET·서비스 키는 키체인, WORKER_SECRET은 .env.local)
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = "https://nookframe.com";
const PATH = "/api/worker/memes";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
if (!process.env.MEME_SECRET) throw new Error("MEME_SECRET not set (keychain nookframe-meme-secret)");

let failed = 0;
const ok = (name, pass, detail = "") => {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
};
const post = async (body, token = process.env.MEME_SECRET) => {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${ORIGIN}${PATH}`, { method: "POST", headers, body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, ...b };
};

const tag = Date.now().toString(36);
const runDate = new Date().toISOString().slice(0, 10);
const text = `__probe_meme_${tag}__ Shipped it. Told no one`;
const line = (over = {}) => ({
  lang: "en", audience: "logged_in", kind: "new", text,
  sensitivity: { level: "green", note: "probe" }, sensitivity_score: 3, ...over,
});
const runIds = [];

try {
  // (1) 열쇠
  const valid = { run: { run_date: runDate, status: "ok" }, lines: [] };
  let r = await post(valid, null);
  ok("(1a) 열쇠 없음 → 401", r.status === 401, `${r.status} ${r.code ?? ""}`);
  r = await post(valid, "nfm_wrong");
  ok("(1b) 틀린 열쇠 → 401", r.status === 401, `${r.status} ${r.code ?? ""}`);
  if (process.env.WORKER_SECRET) {
    r = await post(valid, process.env.WORKER_SECRET);
    ok("(1c) 촬영 워커 비밀 → 401", r.status === 401, `${r.status} ${r.code ?? ""}`);
  } else console.log("- (1c) WORKER_SECRET 없음 — 건너뜀");

  // (2) 모양
  r = await post({ run: { run_date: "2026-13-40", status: "ok" } });
  ok("(2a) 없는 날짜 → 400 run.run_date", r.status === 400 && r.field === "run.run_date", `${r.status} ${r.field ?? ""}`);
  r = await post({ run: { run_date: runDate, status: "ok" }, lines: [line({ text: "a\nb" })] });
  ok("(2b) 두 줄짜리 글 → 400 lines[0].text", r.status === 400 && r.field === "lines[0].text", `${r.status} ${r.field ?? ""}`);
  r = await post({ run: { run_date: runDate, status: "ok" }, lines: [line({ sensitivity: undefined })] });
  ok("(2c) 민감도 없음 → 400", r.status === 400 && r.field === "lines[0].sensitivity", `${r.status} ${r.field ?? ""}`);

  // (3) 넣기 — 같은 줄 2번 + status 'approved'를 섞어 보냄
  r = await post({
    run: { run_date: runDate, status: "ok", counts: { probe: true } },
    lines: [line({ status: "approved" }), line()],
  });
  if (r.runId) runIds.push(r.runId);
  ok("(3a) 200 · 1줄 넣고 1줄 건너뜀", r.status === 200 && r.inserted === 1 && r.skipped === 1,
    `${r.status} inserted=${r.inserted} skipped=${r.skipped} ${r.code ?? ""}`);
  const { data: rows, error: selErr } = await svc.from("meme_lines").select("status, run_id").eq("text", text);
  ok("(3b) 저장된 줄은 '대기'(보낸 status 무시)", !selErr && rows?.length === 1 && rows[0].status === "pending",
    selErr?.message ?? JSON.stringify(rows));
  const { data: runRow } = r.runId
    ? await svc.from("meme_runs").select("status, run_date").eq("id", r.runId).maybeSingle()
    : { data: null };
  ok("(3c) 실행 기록 한 줄", runRow?.status === "ok" && runRow?.run_date === runDate, JSON.stringify(runRow));

  // (4) 다시 보내기
  r = await post({ run: { run_date: runDate, status: "ok" }, lines: [line()] });
  if (r.runId) runIds.push(r.runId);
  ok("(4) 같은 문구 다시 → 0줄 넣음", r.status === 200 && r.inserted === 0 && r.skipped === 1,
    `${r.status} inserted=${r.inserted} skipped=${r.skipped}`);

  // 건너뜀 기록
  r = await post({ run: { run_date: runDate, status: "skipped", reason: "probe: weekly limit" } });
  if (r.runId) runIds.push(r.runId);
  ok("(4b) 건너뜀 기록 → 200", r.status === 200 && r.inserted === 0, `${r.status}`);

  // (5) 익명 키
  const a1 = await anon.from("meme_lines").select("id").limit(1);
  ok("(5a) 익명 키로 meme_lines 못 읽음", !!a1.error || (a1.data ?? []).length === 0, a1.error?.code ?? `rows=${a1.data?.length}`);
  const a2 = await anon.from("meme_runs").select("id").limit(1);
  ok("(5b) 익명 키로 meme_runs 못 읽음", !!a2.error || (a2.data ?? []).length === 0, a2.error?.code ?? `rows=${a2.data?.length}`);
} finally {
  await svc.from("meme_lines").delete().like("text", `__probe_meme_${tag}__%`);
  if (runIds.length) await svc.from("meme_runs").delete().in("id", runIds);
  const { data: left } = await svc.from("meme_lines").select("id").like("text", `__probe_meme_${tag}__%`);
  ok("(정리) 시험 줄 지움", (left ?? []).length === 0);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
