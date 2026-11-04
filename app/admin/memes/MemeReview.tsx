"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Segmented } from "@/components/Segmented";
import { kstDay, type MemeOp, type MemeStatus } from "@/lib/memeReview";

// 오늘의 밈 검토 화면(시안 C '교정쇄', 2026-11-05). 왼쪽 목록 · 오른쪽 무대.
// 무대는 홈과 같은 글꼴·커서로 한 글자씩 쳐서 '공개하면 이렇게 뜬다'를 그대로 보여 준다.
// 이 화면의 한 가지 일: 후보 하나를 공개할지 정하기. 진한 버튼은 '공개하기' 하나.

type TrendSource = { name: string; recent: number; base: number; capped?: boolean };
type Evidence = { url: string; quote: string; date: string; verified: boolean | null };
type Category = { category: string; score: number; raw?: number; reason?: string; evidence?: Evidence[] };
export type MemeRow = {
  id: string;
  lang: "ko" | "en";
  audience: "logged_in" | "everyone";
  kind: "new" | "refresh";
  text: string;
  reply: string | null;
  replaces: string | null;
  source: { format?: string; description?: string; why?: string; sources?: string[] } | null;
  trend: { score: number | null; verdict: string; ratio: number | null; sources?: TrendSource[] } | null;
  sensitivity: {
    score: number; level: string; floors?: string[]; note?: string; categories?: Category[];
    summaries?: { line?: string; echoes?: string; origin?: string | null };
  } | null;
  sensitivity_score: number | null;
  status: MemeStatus;
  edited: boolean;
  reviewed_at: string | null;
  created_at: string;
};
export type MemeRunInfo = {
  run_date: string; status: "ok" | "skipped" | "failed"; reason: string | null;
  usage: { measured?: { session?: number } | null } | null;
  counts: { lines?: number; minutes?: number } | null;
};

type Tab = "new" | "refresh" | "done";

const VERDICT: Record<string, string> = { rising: "상승", alive: "유지", fading: "시듦", insufficient: "근거 부족", dead: "죽음", error: "재지 못함" };
const LEVEL: Record<string, string> = { green: "초록", yellow: "노랑", red: "빨강", drop: "빼기 권장" };
const CATEGORY: Record<string, string> = {
  hate_extremism: "혐오·극단주의", tragedy_death: "참사·죽음", date_collision: "날짜 겹침", real_person: "실존 인물",
  gender_conflict: "성별 갈등", harassment_origin: "괴롭힘에서 나옴", sexual_origin: "성적인 뜻", self_harm_drugs: "자해·약물",
  politics: "정치", religion: "종교", creator_objection: "원작자 반대",
};
const FLOOR: Record<string, string> = {
  sensitive_number_or_date: "민감한 숫자나 날짜가 들어 있어요",
  contested_word: "논란이 있는 낱말이 들어 있어요",
  origin_no_record: "원본 밈 기록을 못 찾았어요",
  injection_seen: "가져온 자료에 속임수 문장이 있었어요",
  judges_disagree: "판정관 둘의 점수가 크게 갈렸어요",
  judge_failed: "판정이 끝나지 않았어요",
};
const STATUS_MARK: Record<MemeStatus, string> = { pending: "·", approved: "✓", rejected: "✕", retired: "↓" };
const STATUS_TEXT: Record<MemeStatus, string> = { pending: "대기", approved: "공개함", rejected: "버림", retired: "내림" };

const levelColor = (score: number) => (score >= 55 ? "var(--ops-bad)" : score >= 30 ? "var(--ops-warn)" : "var(--ops-ok)");
const perDay = (s: TrendSource) => `${(s.recent / 7).toFixed(1)}/일 ← ${(s.base / 30).toFixed(1)}/일`;
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);
const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };

export default function MemeReview({ initial, run, loadError, today }: { initial: MemeRow[]; run: MemeRunInfo | null; loadError: string | null; today: string }) {
  const [rows, setRows] = useState(initial);
  const [tab, setTab] = useState<Tab>("new");
  const list = useMemo(() => rows.filter((r) =>
    tab === "done" ? r.status !== "pending" : r.status === "pending" && r.kind === (tab === "new" ? "new" : "refresh")), [rows, tab]);
  const [selId, setSelId] = useState<string | null>(list[0]?.id ?? null);
  const sel = rows.find((r) => r.id === selId) ?? list[0] ?? null;

  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<"enter" | "leave">("enter");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ text: "", reply: "" });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduce = useRef(false);

  // 고른 줄이 바뀌면 처음부터 다시 친다(움직임 줄이기면 한 번에).
  const total = sel ? sel.text.length + (sel.reply?.length ?? 0) : 0;
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTyped(reduce.current ? total : 0);
    setEditing(false);
    setOpen(false);
    setError(null);
    if (reduce.current) return;
    const t = setInterval(() => setTyped((n) => (n >= total ? n : n + 2)), 28);
    return () => clearInterval(t);
  }, [sel?.id, total]);

  const pick = (id: string) => { setPhase("enter"); setSelId(id); };
  const switchTab = (t: Tab) => {
    setTab(t);
    const first = rows.find((r) => (t === "done" ? r.status !== "pending" : r.status === "pending" && r.kind === (t === "new" ? "new" : "refresh")));
    pick(first?.id ?? "");
  };

  async function act(op: MemeOp) {
    if (!sel || busy) return;
    setBusy(true);
    setError(null);
    const edit = op === "publish" && editing ? { text: draft.text, reply: draft.reply } : {};
    try {
      const r = await fetch("/api/admin/memes", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: sel.id, op, ...edit }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) { setError(body.error ?? "저장하지 못했어요."); return; }
      setPhase("leave");
      await new Promise((res) => setTimeout(res, reduce.current ? 0 : 170));
      const updated = { ...sel, ...body.line };
      const next = rows.map((x) => (x.id === sel.id ? updated : x));
      setRows(next);
      // 같은 탭에서 아직 안 본 다음 줄로
      const pool = next.filter((x) => (tab === "done" ? x.status !== "pending" : x.status === "pending" && x.kind === sel.kind));
      const idx = list.findIndex((x) => x.id === sel.id);
      const after = pool.find((x) => list.findIndex((y) => y.id === x.id) > idx) ?? pool[0];
      pick(after?.id ?? "");
    } catch {
      setError("연결이 끊겼어요. 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const publishedToday = rows.filter((r) => r.status === "approved" && r.reviewed_at && kstDay(Date.parse(r.reviewed_at)) === today).length;
  const count = (t: Tab) => rows.filter((r) => (t === "done" ? r.status !== "pending" : r.status === "pending" && r.kind === (t === "new" ? "new" : "refresh"))).length;

  const runLine = !run ? "아직 밤 작업 기록이 없어요."
    : run.status === "ok"
      ? `${run.run_date} 밤 작업이 끝났어요. 후보 ${run.counts?.lines ?? 0}줄, ${run.counts?.minutes ?? "?"}분${run.usage?.measured?.session != null ? `, 구독 사용량 ${run.usage.measured.session}%` : ""}`
      : run.status === "skipped" ? `${run.run_date} 밤엔 쉬었어요. ${run.reason ?? ""}` : `${run.run_date} 밤 작업이 실패했어요. ${run.reason ?? ""}`;

  const score = sel?.sensitivity_score ?? sel?.sensitivity?.score ?? 0;
  const flagged = score >= 30;
  const showEvidence = flagged || open;
  const tl = sel?.text.length ?? 0;

  return (
    <main className="nf-ops" style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", padding: "40px 24px 64px" }}>
      <style>{MEME_CSS}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Link href="/admin" style={{ fontSize: 13, color: "var(--text-secondary)" }}>관제탑으로</Link>
            <h1 className="vf-serif-display" style={{ fontSize: "1.9rem", margin: 0 }}>오늘의 밈</h1>
            <p style={{ margin: 0, fontSize: 14, color: run?.status === "failed" ? "var(--danger)" : "var(--text-secondary)" }}>{runLine}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
              오늘 공개 <span className="vf-mono" style={{ color: "var(--text-primary)", fontSize: 15 }}>{publishedToday}/10</span>
            </span>
            <Segmented<Tab> label="후보 묶음" value={tab} onPick={switchTab} options={[
              { value: "new", label: `새 밈 ${count("new")}` },
              { value: "refresh", label: `고친 문구 ${count("refresh")}` },
              { value: "done", label: `끝낸 것 ${count("done")}` },
            ]} />
          </div>
        </header>

        {loadError && <p style={{ margin: 0, fontSize: 14, color: "var(--danger)" }}>{loadError}</p>}

        {!sel ? (
          <div style={{ background: "var(--surface-soft)", borderRadius: 16, padding: "48px 24px", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 15 }}>{tab === "done" ? "최근 14일 동안 끝낸 줄이 없어요." : "검토할 후보가 없어요."}</p>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--text-secondary)" }}>밤 작업이 새 후보를 가져오면 여기 떠요.</p>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <nav aria-label="후보 목록" className="nf-meme-list" style={{ flex: "1 1 300px", maxWidth: 360, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, background: "var(--surface-soft)", borderRadius: 16, padding: 8 }}>
              {list.map((r) => (
                <button key={r.id} type="button" onClick={() => pick(r.id)} className="vf-row-button" data-active={r.id === sel.id}
                  aria-current={r.id === sel.id}
                  style={{ border: 0, textAlign: "left", display: "flex", gap: 10, alignItems: "baseline", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                    background: r.id === sel.id ? "var(--surface-active)" : undefined, color: r.status === "pending" ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  <span className="vf-mono" aria-label={STATUS_TEXT[r.status]} style={{ fontSize: 13, width: 14, flex: "none",
                    color: r.status === "approved" ? "var(--ops-ok)" : r.status === "pending" ? "var(--text-secondary)" : "var(--danger)" }}>{STATUS_MARK[r.status]}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                    textDecoration: r.status === "rejected" ? "line-through" : "none" }}>{r.text}</span>
                </button>
              ))}
            </nav>

            <section aria-label="고른 후보" style={{ flex: "999 1 560px", minWidth: 0 }}>
              <div key={sel.id + phase} className={phase === "leave" ? "nf-meme-leave" : "nf-meme-enter"}
                style={{ background: "var(--surface)", borderRadius: 16, boxShadow: "var(--shadow-panel)", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, padding: "6px 12px", borderRadius: 999, background: "var(--surface-soft)" }}>
                    {sel.audience === "everyone" ? "모두에게 (처음 온 사람 포함)" : "로그인한 사람에게"}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {sel.status === "approved" ? "지금 홈에 떠요"
                      : sel.audience === "everyone" ? "공개하면 로그아웃 홈 소개 다음과 로그인 홈에 떠요" : "공개하면 로그인 홈 맨 앞에 떠요"}
                  </span>
                  {sel.status !== "pending" && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>· {STATUS_TEXT[sel.status]}{sel.edited ? " (고쳐서)" : ""}</span>}
                </div>

                {sel.kind === "refresh" && sel.replaces && (
                  <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>바꿀 기존 문구: <s>{sel.replaces}</s></p>
                )}

                {!editing ? (
                  <div aria-label={sel.reply ? `${sel.text} / ${sel.reply}` : sel.text}
                    style={{ background: "var(--bg)", borderRadius: 12, minHeight: 196, padding: "40px 32px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                    <p aria-hidden style={{ margin: 0, fontFamily: "var(--font-serif), serif", fontWeight: 500, fontSize: 30, lineHeight: 1.4, maxWidth: "22ch", wordBreak: "keep-all" }}>
                      {sel.text.slice(0, Math.min(typed, tl))}
                      {(typed <= tl || !sel.reply) && <span className="vf-cursor vf-cursor-inline" />}
                    </p>
                    {sel.reply && typed > tl && (
                      <p aria-hidden style={{ margin: 0, fontFamily: "var(--font-serif), serif", fontStyle: "italic", fontSize: 21, color: "var(--text-secondary)", maxWidth: "30ch" }}>
                        <span style={{ marginRight: "0.35em", opacity: 0.7 }}>↳</span>
                        {sel.reply.slice(0, typed - tl)}
                        <span className="vf-cursor vf-cursor-inline" />
                      </p>
                    )}
                  </div>
                ) : (
                  <div style={{ background: "var(--bg)", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>첫 줄
                      <input className="vf-input" value={draft.text} maxLength={120} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                        style={{ fontFamily: "var(--font-serif), serif", fontSize: 20 }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>답글 (없으면 비워 둬요)
                      <input className="vf-input" value={draft.reply} maxLength={120} onChange={(e) => setDraft({ ...draft, reply: e.target.value })}
                        style={{ fontFamily: "var(--font-serif), serif", fontSize: 17 }} />
                    </label>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--ops-warn)" }}>고친 글은 다시 검사하지 않아요. 검사는 고치기 전 글 기준이에요.</p>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                  <div style={{ background: "var(--surface-soft)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>유행</span>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>
                      {sel.trend ? `${VERDICT[sel.trend.verdict] ?? sel.trend.verdict}${sel.trend.ratio ? ` ×${sel.trend.ratio}` : ""}` : "최신화라 유행 검사 없음"}
                    </span>
                    {(sel.trend?.sources ?? []).map((s) => (
                      <span key={s.name} className="vf-mono" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {s.name === "hackernews" ? "Hacker News" : s.name === "bluesky" ? "Bluesky" : s.name === "wikipedia" ? "위키 조회/100" : s.name} {perDay(s)}{s.capped ? " (어림)" : ""}
                      </span>
                    ))}
                    {sel.source?.format && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>비튼 틀: {sel.source.format}</span>}
                  </div>
                  <div style={{ background: "var(--surface-soft)", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>민감도</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: levelColor(score) }}>
                      <span className="vf-mono">{score}</span> {LEVEL[sel.sensitivity?.level ?? ""] ?? ""}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {flagged ? (sel.sensitivity?.floors?.map((f) => FLOOR[f]).filter(Boolean)[0] ?? "확인해 볼 것이 있어요") : "걸리는 것이 없어요"}
                    </span>
                    {!flagged && (
                      <button type="button" className="vf-button-text" aria-expanded={open} onClick={() => setOpen(!open)} style={{ alignSelf: "flex-start", fontSize: 13 }}>
                        {open ? "조사 내용 접기" : "조사 내용 보기"}
                      </button>
                    )}
                  </div>
                </div>

                {showEvidence && sel.sensitivity && <EvidencePanel s={sel.sensitivity} flagged={flagged} />}

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 4 }}>
                  {sel.status === "pending" && !editing && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                      <button type="button" className="vf-button-primary" disabled={busy} onClick={() => act("publish")}>공개하기</button>
                      <button type="button" className="vf-button-ghost" disabled={busy}
                        onClick={() => { setDraft({ text: sel.text, reply: sel.reply ?? "" }); setEditing(true); }}>고쳐서 공개</button>
                      <button type="button" className="vf-button-text" disabled={busy} onClick={() => act("drop")} style={{ color: "var(--danger)" }}>버리기</button>
                    </div>
                  )}
                  {sel.status === "pending" && editing && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <button type="button" className="vf-button-primary" disabled={busy || !draft.text.trim()} onClick={() => act("publish")}>고친 대로 공개</button>
                      <button type="button" className="vf-button-text" disabled={busy} onClick={() => setEditing(false)}>그만 고치기</button>
                    </div>
                  )}
                  {sel.status === "approved" && (
                    <button type="button" className="vf-button-ghost" disabled={busy} onClick={() => act("retire")}>홈에서 내리기</button>
                  )}
                  {(sel.status === "rejected" || sel.status === "retired") && (
                    <button type="button" className="vf-button-ghost" disabled={busy} onClick={() => act("restore")}>다시 검토하기</button>
                  )}
                  {error && <p role="alert" style={{ margin: 0, fontSize: 14, color: "var(--danger)" }}>{error}</p>}
                </div>
              </div>
              <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>
                공개한 줄은 바로 홈에 떠요. 끝낸 것에서 언제든 내릴 수 있어요.
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function EvidencePanel({ s, flagged }: { s: NonNullable<MemeRow["sensitivity"]>; flagged: boolean }) {
  const cats = (s.categories ?? []).filter((c) => c.score >= 10).slice(0, 4);
  const sums: [string, string | null | undefined][] = [
    ["우리 줄을 조사한 결과", s.summaries?.line], ["떠올리게 하는 것", s.summaries?.echoes], ["원본 밈", s.summaries?.origin],
  ];
  return (
    <div style={{ background: flagged ? "var(--surface-sunken)" : "var(--surface-soft)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
      {s.note && <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{s.note}</p>}
      {(s.floors ?? []).map((f) => FLOOR[f] && <p key={f} style={{ margin: 0, fontSize: 14, color: "var(--ops-warn)" }}>{FLOOR[f]}</p>)}
      {cats.map((c) => (
        <div key={c.category} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{CATEGORY[c.category] ?? c.category} <span className="vf-mono">{c.score}</span></span>
          {c.reason && <span style={{ fontSize: 14, lineHeight: 1.5 }}>{c.reason}</span>}
          {(c.evidence ?? []).map((e, i) => {
            const url = safeUrl(e.url);
            return (
              <span key={i} style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {e.quote && <>“{e.quote}” </>}
                {url ? <a href={url} target="_blank" rel="noopener noreferrer nofollow">{host(url)}</a> : e.url}
                {e.date && `, ${e.date}`}
                {`, ${e.verified === true ? "인용 확인됨" : e.verified === false ? "인용을 원문에서 못 찾음" : "원문 확인 못 함"}`}
              </span>
            );
          })}
        </div>
      ))}
      {sums.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{k}</span>
          <span lang="en" style={{ fontSize: 14, lineHeight: 1.5 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// 이 화면에서만 쓰는 상태 색(관제탑과 같은 값) + 카드 들어오기·나가기(들어올 때 0.26초, 나갈 때 0.17초).
// ui-allow: color 관제탑(app/admin/page.tsx)과 같은 화면 한정 상태 색 — 다크 값도 같이 둔다
const MEME_CSS = `
.nf-ops { --ops-ok: #2e7d4a; --ops-warn: #a5741f; --ops-bad: #b53f3f; }
[data-theme="dark"] .nf-ops { --ops-ok: #3f9e60; --ops-warn: #bd831f; --ops-bad: #cd5f4a; }
@keyframes nf-meme-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes nf-meme-out { to { opacity: 0; transform: translateY(-14px); } }
.nf-meme-enter { animation: nf-meme-in 260ms cubic-bezier(.23,1,.32,1) both; }
.nf-meme-leave { animation: nf-meme-out 170ms cubic-bezier(.55,0,1,.45) both; }
@media (prefers-reduced-motion: reduce) { .nf-meme-enter, .nf-meme-leave { animation: none; } }
@media (max-width: 760px) { .nf-meme-list { max-width: none !important; max-height: 40vh; overflow-y: auto; } }
`;
