"use client";

import { useEffect, useRef, useState } from "react";

// 비상 정지(2026-11-02) — 뚫렸을 때 피해를 멈추는 버튼 셋. app/api/admin/stop.
// 평소엔 접혀 있고(원할 때만 보여 준다), 잠금이 하나라도 켜져 있거나 경보 메일의
// [비상 정지 열기](/admin#stop)로 들어오면 펼친다. 누를 때마다 관리자 메일이 간다.

export type StopState = {
  readonlyAt: string | null;
  uploadsClosedAt: string | null;
  tokensRevokedAt: string | null;
  activeTokens: number | null;
};

type Row = {
  key: "readonly" | "uploads";
  title: string;
  what: string;
  onLabel: string;
  offLabel: string;
  at: string | null;
};

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
}

export function StopPanel({ initial }: { initial: StopState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const locked = !!(state.readonlyAt || state.uploadsClosedAt);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (window.location.hash === "#stop" && ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView({ block: "start" });
    }
  }, []);

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "조치에 실패했어요. 다시 눌러 주세요.");
    return body;
  }

  async function toggle(row: Row) {
    const on = !row.at;
    if (on && !confirm(`${row.title}: ${row.what}\n\n지금 켤까요? 관리자 메일이 가요.`)) return;
    setBusy(row.key);
    setError(null);
    setDone(null);
    try {
      await post({ action: row.key, on });
      const now = on ? new Date().toISOString() : null;
      setState((s) => (row.key === "readonly" ? { ...s, readonlyAt: now } : { ...s, uploadsClosedAt: now }));
      setDone(on ? `${row.title}을 켰어요. 길어야 5초면 모든 서버가 따라요.` : `${row.title}을 풀었어요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조치에 실패했어요.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    const ask =
      "AI 연결 토큰·연결 코드·로그인을 전부 끊어요. 되돌릴 수 없어요.\n" +
      "모든 사용자가 다시 로그인하고 AI를 다시 연결해야 해요. 나도 로그아웃돼요.\n\n지금 끊을까요?";
    if (!confirm(ask)) return;
    setBusy("revoke");
    setError(null);
    setDone(null);
    try {
      const r = await post({ action: "revoke" });
      setState((s) => ({ ...s, tokensRevokedAt: new Date().toISOString(), activeTokens: 0 }));
      setDone(`토큰 ${r.tokens ?? 0}개 · 연결 코드 ${r.codes ?? 0}개 · 로그인 ${r.sessions ?? 0}개를 끊었어요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조치에 실패했어요.");
    } finally {
      setBusy(null);
    }
  }

  const rows: Row[] = [
    {
      key: "readonly",
      title: "읽기 전용",
      what: "방문자는 그대로 보고, 저장·업로드·새 연결은 전부 멈춰요.",
      onLabel: "읽기 전용으로 잠그기",
      offLabel: "읽기 전용 풀기",
      at: state.readonlyAt,
    },
    {
      key: "uploads",
      title: "업로드 닫기",
      what: "새 작품·파일 올리기만 멈춰요. 나머지는 그대로예요.",
      onLabel: "업로드 닫기",
      offLabel: "업로드 다시 열기",
      at: state.uploadsClosedAt,
    },
  ];

  return (
    <details id="stop" ref={ref} className="nf-ops-fold mt-7" open={locked || undefined}>
      <summary>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        비상 정지{locked ? " · 켜져 있음" : ""}
      </summary>
      <section className="vf-card p-5 mt-4 flex flex-col gap-4" style={{ maxWidth: "720px" }}>
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: row.at ? "var(--ops-bad)" : "var(--text-primary)" }}>
                {row.title}
                {row.at ? ` · ${when(row.at)}부터 켜짐` : ""}
              </p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{row.what}</p>
            </div>
            <button
              onClick={() => toggle(row)}
              disabled={busy !== null}
              className="vf-button-ghost"
            >
              {busy === row.key ? "처리 중…" : row.at ? row.offLabel : row.onLabel}
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
              연결·로그인 전부 끊기
              {state.activeTokens !== null ? ` · 살아 있는 토큰 ${state.activeTokens}개` : ""}
            </p>
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              되돌릴 수 없어요. 모두 다시 로그인하고 AI를 다시 연결해야 해요.
              {state.tokensRevokedAt ? ` 마지막: ${when(state.tokensRevokedAt)}` : ""}
            </p>
          </div>
          <button onClick={revoke} disabled={busy !== null} className="vf-button-primary" data-danger="true">
            {busy === "revoke" ? "끊는 중…" : "전부 끊기"}
          </button>
        </div>
        {done && <p className="text-sm" style={{ color: "var(--ops-ok)" }}>{done}</p>}
        {error && <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}
      </section>
    </details>
  );
}
