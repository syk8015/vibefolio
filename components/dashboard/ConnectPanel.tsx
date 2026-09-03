"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { copyText } from "@/lib/clipboard";
import { pastePrompt, AUTO_TOKEN_NAME, MCP_TOKEN_NAME, mcpClaudeCodeCommand, mcpConfigJson } from "@/lib/connectSnippets";
import { useT } from "@/lib/i18n/client";

interface TokenRow {
  id: string;
  token_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

// AI 연결 화면 — AddProjectModal의 기본 화면(추가 진입점 재구조 08-14).
//
// 요청5(2026-08-14): "토큰 발급 → 프롬프트 복사" 2단계를 버튼 하나로 단일화.
// [프롬프트 복사]가 눌리는 순간 서버가 새 토큰을 발급(이전 자동발급분 폐기)하고,
// 토큰이 든 프롬프트를 통째로 클립보드에 넣는다. raw 토큰은 화면에 절대 안 그린다 —
// 미리보기 <pre>는 token 없이 호출돼 자리표시 문구가 들어간다.
//
// 축약 개편(08-14, 사용자 피드백 "글자가 너무 많다"): 소개 문단·카드 제목·발급
// 설명문 삭제(모달 부제가 소개를 담당), 한 줄 단계 안내 + 큰 복사 버튼만 기본
// 노출. 프롬프트 전문과 토큰 목록은 접힘 — 펼쳐야 보인다.
export default function ConnectPanel() {
  const { t, locale } = useT();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [copying, setCopying] = useState(false);
  const [copiedOnce, setCopiedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  // MCP 연결(2026-09-04, 인터뷰 ⑦): 토큰을 채운 명령/설정을 복사한다.
  const [showMcp, setShowMcp] = useState(false);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpCopied, setMcpCopied] = useState<"claude-code" | "json" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://nookframe.com";

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("api_tokens")
      .select("id, token_prefix, name, created_at, last_used_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    setTokens((data as TokenRow[]) ?? []);
  }
  // 마운트 시 1회 토큰 목록 로드 — 훅 규칙은 await 뒤 setState까지 동기로 보수
  // 판정하지만 실제 캐스케이드 렌더는 없다(ProjectsTab loadProjects와 동일).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  // 발급+복사 원자 흐름. 발급은 됐는데 클립보드가 실패하면 그 토큰은 버려진 상태로
  // 남지만, 다음 시도가 자동 폐기하므로 따로 청소하지 않는다.
  async function copyMcp(kind: "claude-code" | "json") {
    setMcpBusy(true);
    setError(null);
    setMcpCopied(null);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcp: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || t.connect.issueFailed);
        return;
      }
      const text = kind === "claude-code" ? mcpClaudeCodeCommand(body.token as string) : mcpConfigJson(body.token as string);
      const ok = await copyText(text);
      if (!ok) {
        setError(t.connect.copyFailed);
        return;
      }
      setMcpCopied(kind);
      await load();
    } catch {
      setError(t.connect.networkFailed);
    } finally {
      setMcpBusy(false);
    }
  }

  async function copyPromptWithToken() {
    setCopying(true);
    setError(null);
    setCopiedOnce(false);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || t.connect.issueFailed);
        return;
      }
      const ok = await copyText(pastePrompt(origin, locale, body.token as string));
      if (!ok) {
        setError(t.connect.copyFailed);
        return;
      }
      setCopiedOnce(true);
      await load();
    } catch {
      setError(t.connect.networkFailed);
    } finally {
      setCopying(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm(t.connect.revokeConfirm)) return;
    setTokens((prev) => prev.filter((t) => t.id !== id)); // optimistic
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      setError(t.connect.revokeFailed);
      load();
    }
  }

  const toggleStyle: React.CSSProperties = {
    color: "var(--text-muted)", fontFamily: "var(--font-nunito)",
    fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
    background: "none", border: "none", padding: 0,
    display: "inline-flex", alignItems: "center", gap: 5,
  };
  const chevron = (open: boolean) => (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>
      <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <div className="flex flex-col items-center text-center">
      {/* 한 줄 단계 안내 — 옛 소개 문단·설명문을 전부 대체 */}
      <p className="text-xs mb-5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>
        {t.connect.steps}
      </p>

      <button
        type="button"
        onClick={copyPromptWithToken}
        disabled={copying}
        className="vf-button-primary"
        style={{ fontSize: "0.95rem", padding: "0.85rem 2.2rem", opacity: copying ? 0.6 : 1 }}
      >
        {copying ? t.connect.copying : t.connect.copyPrompt}
      </button>

      {copiedOnce && (
        <p className="text-xs mt-3" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
          {t.connect.copiedNote}
        </p>
      )}
      {error && (
        <p className="text-xs mt-3" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>{error}</p>
      )}

      {/* 접힘: 프롬프트 전문 + 챗봇(셸 없음) 폴백 */}
      <div className="w-full mt-6 text-left">
        <button type="button" onClick={() => setShowPrompt(v => !v)} aria-expanded={showPrompt} style={toggleStyle}>
          {chevron(showPrompt)}{t.connect.previewToggle}
        </button>
        {showPrompt && (
          <div className="mt-2">
            <pre
              className="text-xs p-3 rounded-lg"
              style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace", whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 220, overflowY: "auto" }}
            >
              {pastePrompt(origin, locale)}
            </pre>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
              {t.connect.noShell1}<Link href="/publish" style={{ color: "var(--text-primary)", textDecoration: "underline" }}>{origin.replace(/^https?:\/\//, "")}/publish</Link>{t.connect.noShell2}
            </p>
          </div>
        )}
      </div>

      {/* 접힘: MCP 연결 — 터미널 AI는 붙여넣기 자체가 없어진다(인터뷰 ⑦) */}
      <div className="w-full mt-3 text-left">
        <button type="button" onClick={() => setShowMcp(v => !v)} aria-expanded={showMcp} style={toggleStyle}>
          {chevron(showMcp)}{t.connect.mcpToggle}
        </button>
        {showMcp && (
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7, margin: 0 }}>
              {t.connect.mcpLead}
            </p>
            {([
              { kind: "claude-code" as const, label: t.connect.mcpClaudeCode, text: mcpClaudeCodeCommand() },
              { kind: "json" as const, label: t.connect.mcpJson, text: mcpConfigJson() },
            ]).map(({ kind, label, text }) => (
              <div key={kind}>
                <p className="text-xs" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, margin: "0 0 6px" }}>{label}</p>
                <pre
                  className="text-xs p-3 rounded-lg"
                  style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0, wordBreak: "break-all" }}
                >
                  {text}
                </pre>
                <div className="flex items-center gap-3 flex-wrap mt-2">
                  <button type="button" onClick={() => void copyMcp(kind)} disabled={mcpBusy} className="vf-button-ghost" style={{ fontSize: "0.75rem", padding: "0.35rem 0.8rem", opacity: mcpBusy ? 0.6 : 1 }}>
                    {mcpBusy ? t.connect.mcpCopying : t.connect.mcpCopy}
                  </button>
                  {mcpCopied === kind && (
                    <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>{t.connect.mcpCopied}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 접힘: 발급된 토큰 — 없으면 아예 안 그린다 */}
      {tokens.length > 0 && (
        <div className="w-full mt-3 text-left">
          <button type="button" onClick={() => setShowTokens(v => !v)} aria-expanded={showTokens} style={toggleStyle}>
            {chevron(showTokens)}{t.connect.tokensToggle(tokens.length)}
          </button>
          {showTokens && (
            <div className="flex flex-col gap-2 mt-2">
              {tokens.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="min-w-0">
                    <p className="text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 500 }}>
                      {row.name === AUTO_TOKEN_NAME ? t.connect.autoTokenName : row.name === MCP_TOKEN_NAME ? t.connect.mcpTokenName : row.name || t.connect.unnamed}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                      {row.token_prefix} · {row.last_used_at ? t.connect.lastUsed(new Date(row.last_used_at).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US")) : t.connect.neverUsed}
                    </p>
                  </div>
                  <button onClick={() => revoke(row.id)} className="vf-button-ghost" style={{ fontSize: "0.75rem", padding: "0.35rem 0.7rem", whiteSpace: "nowrap" }}>
                    {t.connect.revoke}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
