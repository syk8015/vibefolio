"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { copyText, copyTextLater } from "@/lib/clipboard";
import { ManualCopyBox } from "@/components/dashboard/ManualCopyBox";
import { pastePrompt, AUTO_TOKEN_NAME, MCP_TOKEN_NAME, mcpClaudeCodeCommand, mcpConfigJson, remoteMcpUrl } from "@/lib/connectSnippets";
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
// [프롬프트 복사]가 눌리는 순간 서버가 1회용 연결 코드를 발급하고(09-16부터 토큰
// 대신 코드), 코드가 든 프롬프트를 통째로 클립보드에 넣는다. 미리보기 <pre>는 코드
// 없이 호출돼 자리표시 문구가 들어간다. 예외는 자동 복사가 막힌 브라우저뿐 — 그때만
// 받은 글을 직접 복사 칸(ManualCopyBox)에 펼친다(A2, 2026-09-22).
//
// 축약 개편(08-14, 사용자 피드백 "글자가 너무 많다"): 소개 문단·카드 제목·발급
// 설명문 삭제(모달 부제가 소개를 담당), 한 줄 단계 안내 + 큰 복사 버튼만 기본
// 노출. 프롬프트 전문과 토큰 목록은 접힘 — 펼쳐야 보인다.
//
// 첫 질문 개편(2026-09-22, 출시 점검 첫인상 #2): 한 창에 네 갈래(프롬프트·챗봇·MCP·
// 토큰)가 한꺼번에 있어 비개발자는 자기가 어느 갈래인지부터 막혔다. "어떤 AI로
// 만들었나요?"를 먼저 묻고 그 길 하나만 보여준다. 새 통로는 없다 — 이미 있던 셋
// (프롬프트 / 원격 커넥터 / /publish 붙여넣기)의 순서만 답에 맞춰 바꾼다(09-18 결정).
// 클로드는 커넥터가 가장 짧은 길이라 그 답의 첫 화면이 주소다.
type AiPath = "terminal" | "claude" | "chat";
const PATH_KEY = "nf.connect.path";
const PATHS: AiPath[] = ["terminal", "claude", "chat"];

export default function ConnectPanel() {
  const { t, locale } = useT();
  const [path, setPath] = useState<AiPath | null>(null);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [copying, setCopying] = useState(false);
  const [copiedOnce, setCopiedOnce] = useState(false);
  // 자동 복사가 막혔을 때(사파리 등) 받은 글을 펼쳐 두는 칸 — A2(2026-09-22).
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const [manualMcp, setManualMcp] = useState<{ kind: "claude-code" | "json"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  // MCP 연결(2026-09-04, 인터뷰 ⑦): 토큰을 채운 명령/설정을 복사한다.
  const [showMcp, setShowMcp] = useState(false);
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpCopied, setMcpCopied] = useState<"claude-code" | "json" | null>(null);
  // 원격 커넥터 주소 복사(2026-09-17). 위 둘과 달리 **토큰을 발급하지 않는다** —
  // 공개 주소 하나를 복사할 뿐이고, 인증은 클로드가 띄우는 [허용] 화면에서 일어난다.
  const [urlCopied, setUrlCopied] = useState(false);
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
  // 마운트 시 1회 토큰 목록 로드 + 지난번 답(어떤 AI) 복원. 훅 규칙은 await 뒤
  // setState까지 동기로 보수 판정하지만 실제 캐스케이드 렌더는 없다(ProjectsTab loadProjects와 동일).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    try {
      const saved = localStorage.getItem(PATH_KEY) as AiPath | null;
      if (saved && PATHS.includes(saved)) setPath(saved);
    } catch {
      // 저장소가 막힌 브라우저 — 매번 묻는 것으로 충분하다.
    }
  }, []);

  function choose(p: AiPath) {
    setPath(p);
    setError(null);
    try { localStorage.setItem(PATH_KEY, p); } catch { /* 위와 같음 */ }
  }

  async function copyRemoteUrl() {
    setError(null);
    const ok = await copyText(remoteMcpUrl(origin));
    if (!ok) {
      setError(t.connect.copyFailed);
      return;
    }
    setUrlCopied(true);
  }

  // 발급+복사 원자 흐름. 발급은 됐는데 클립보드가 실패하면 받은 글을 직접 복사 칸에
  // 펼친다(그 토큰은 살아 있으니 버리지 않는다). 복사는 fetch보다 **먼저** 시작해야
  // 사파리가 허락한다(copyTextLater) — await를 앞에 두지 말 것.
  function copyMcp(kind: "claude-code" | "json") {
    setMcpBusy(true);
    setError(null);
    setMcpCopied(null);
    setManualMcp(null);
    let text = "";
    const ready = fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mcp: true }),
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || t.connect.issueFailed);
      text = kind === "claude-code" ? mcpClaudeCodeCommand(body.token as string) : mcpConfigJson(body.token as string);
      return text;
    });
    copyTextLater(ready)
      .then(async (ok) => {
        if (ok) setMcpCopied(kind);
        else setManualMcp({ kind, text });
        await load();
      })
      .catch((err) => setError(err instanceof TypeError ? t.connect.networkFailed : (err as Error).message))
      .finally(() => setMcpBusy(false));
  }

  function copyPromptWithCode() {
    setCopying(true);
    setError(null);
    setCopiedOnce(false);
    setManualPrompt(null);
    // 프롬프트에 심는 것은 토큰이 아니라 **1회용 페어링 코드**다(2026-09-16). 이
    // 프롬프트는 AI 채팅창에 붙여넣는 물건이라, 토큰을 박으면 살아 있는 크리덴셜이
    // 대화 기록에 영구히 남는다. 토큰은 CLI `login <코드>`가 교환할 때 비로소 생긴다
    // — 복사만 하고 안 쓰면 토큰은 아예 만들어지지 않는다.
    let prompt = "";
    const ready = fetch("/api/connect/code", { method: "POST" }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || t.connect.issueFailed);
      prompt = pastePrompt(origin, locale, body.code as string);
      return prompt;
    });
    copyTextLater(ready)
      .then(async (ok) => {
        if (ok) setCopiedOnce(true);
        else setManualPrompt(prompt);
        await load();
      })
      .catch((err) => setError(err instanceof TypeError ? t.connect.networkFailed : (err as Error).message))
      .finally(() => setCopying(false));
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
  const cardStyle: React.CSSProperties = { background: "var(--surface-soft)" };
  const smallText = (color: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
    color, fontFamily: "var(--font-nunito)", lineHeight: 1.6, margin: 0, ...extra,
  });
  const preStyle: React.CSSProperties = {
    background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace",
    whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0, wordBreak: "break-all",
  };
  // /publish는 **새 탭**으로 연다(C3) — 같은 탭이면 대시보드가 사라지면서 "도착하면
  // 저절로 확인 화면" 흐름도 같이 끝난다. 이 창은 남아서 도착을 기다린다.
  const pasteLink = (
    <a
      href="/publish"
      target="_blank"
      rel="noopener"
      className="vf-button-primary inline-block"
      style={{ fontSize: "0.85rem", padding: "0.5rem 1.1rem", textDecoration: "none", margin: "8px 0 0" }}
    >
      {t.connect.pasteJsonCta}
    </a>
  );

  const choices: { id: AiPath; label: string; sub: string }[] = [
    { id: "terminal", label: t.connect.pickTerminal, sub: t.connect.pickTerminalSub },
    { id: "claude", label: t.connect.pickClaude, sub: t.connect.pickClaudeSub },
    { id: "chat", label: t.connect.pickChat, sub: t.connect.pickChatSub },
  ];

  return (
    <div className="flex flex-col items-center text-center">
      {/* 첫 질문 — 답에 따라 아래 길이 하나만 보인다 */}
      <p className="text-sm mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, margin: "0 0 12px" }}>
        {t.connect.ask}
      </p>
      <div role="radiogroup" aria-label={t.connect.ask} className="w-full grid gap-2 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))" }}>
        {choices.map((c) => {
          const on = path === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(c.id)}
              className="rounded-2xl px-3 py-3 text-left"
              style={{
                background: on ? "var(--surface)" : "var(--surface-soft)",
                boxShadow: on ? "inset 0 0 0 1.5px var(--text-primary)" : "none",
                border: "none", cursor: "pointer", transition: "box-shadow 0.15s, background 0.15s",
              }}
            >
              <span className="block text-sm" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600 }}>{c.label}</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>{c.sub}</span>
            </button>
          );
        })}
      </div>

      {path && (
        <p className="text-xs mb-5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.7 }}>
          {path === "terminal" ? t.connect.stepsTerminal : path === "chat" ? t.connect.stepsChat : t.connect.stepsClaude}
        </p>
      )}

      {/* 클로드 — 원격 커넥터 주소가 첫 화면(2026-09-17 원격 커넥터, 09-22 앞으로) */}
      {path === "claude" && (
        <div className="w-full text-left flex flex-col gap-2">
          <p className="text-xs" style={smallText("var(--text-primary)", { fontWeight: 600 })}>
            {t.connect.mcpRemoteTitle}
          </p>
          <pre className="text-xs p-3 rounded-lg" style={preStyle}>{remoteMcpUrl(origin)}</pre>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => void copyRemoteUrl()} className="vf-button-primary" style={{ fontSize: "0.85rem", padding: "0.5rem 1.1rem" }}>
              {t.connect.mcpRemoteCopy}
            </button>
            {urlCopied && <span className="text-xs" style={smallText("var(--text-secondary)")}>{t.connect.mcpRemoteCopied}</span>}
          </div>
          <p className="text-xs" style={smallText("var(--text-secondary)", { lineHeight: 1.7, marginTop: 4 })}>{t.connect.mcpRemoteHint}</p>
          <p className="text-xs" style={smallText("var(--text-secondary)", { lineHeight: 1.7 })}>{t.connect.mcpRemoteAuthTip}</p>
          <p className="text-xs" style={smallText("var(--text-secondary)", { lineHeight: 1.7 })}>{t.connect.mcpRemoteNext}</p>
          <p className="text-xs" style={smallText("var(--text-muted)", { lineHeight: 1.7 })}>
            {t.connect.mcpRemoteCaveat} {t.connect.claudeFallback}
            <button type="button" onClick={() => choose("chat")} style={{ ...toggleStyle, color: "var(--text-primary)", textDecoration: "underline", fontWeight: 500, display: "inline" }}>
              {t.connect.claudeFallbackLink}
            </button>
          </p>
        </div>
      )}

      {/* 터미널·채팅 AI — 프롬프트 복사가 첫 동작 */}
      {(path === "terminal" || path === "chat") && (
        <>
          <button
            type="button"
            onClick={copyPromptWithCode}
            disabled={copying}
            className="vf-button-primary"
            style={{
              fontSize: "0.95rem", padding: "0.85rem 2.2rem", opacity: copying ? 0.6 : 1,
              // 복사됐다는 걸 버튼 스스로 말하게 한다(2026-09-05 사용자 지적) —
              // 라벨이 ✓로 바뀌고 살짝 커진다. 아래 작은 문구만으로는 눌린 티가 안 났다.
              transform: copiedOnce ? "scale(1.05)" : "scale(1)",
              transition: "transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1)",
            }}
          >
            {copying ? t.connect.copying : copiedOnce ? t.connect.copiedButton : t.connect.copyPrompt}
          </button>
          {manualPrompt && <div className="w-full mt-4"><ManualCopyBox text={manualPrompt} /></div>}
          {(copiedOnce || manualPrompt) && (
            <p className="text-xs mt-3" style={smallText("var(--text-muted)")}>{t.connect.copiedNote}</p>
          )}
        </>
      )}

      {/* 터미널 AI: 복사 후 = AI가 올려주기를 기다리는 시간. 초안이 도착하면 ProjectsTab이
          이 모달을 닫고 검토 화면을 연다(useDraftArrival) — 그때까지의 안내. */}
      {path === "terminal" && (copiedOnce || manualPrompt) && (
        <div className="mt-4 w-full rounded-2xl px-4 py-3.5 flex items-start gap-3 text-left" style={cardStyle}>
          <span className="vf-spinner shrink-0" style={{ width: "0.9rem", height: "0.9rem", marginTop: 2 }} />
          <div className="min-w-0">
            <p className="text-xs" style={smallText("var(--text-primary)", { fontWeight: 600 })}>{t.connect.waitingTitle}</p>
            <p className="text-xs" style={smallText("var(--text-secondary)", { marginTop: 4 })}>{t.connect.waitingBody}</p>
            {/* 터미널 AI가 예상과 달리 답만 주고 끝났을 때의 출구(2026-09-18). */}
            <div style={{ borderTop: "1px solid var(--border)", margin: "12px 0 0", paddingTop: 12 }}>
              <p className="text-xs" style={smallText("var(--text-primary)", { fontWeight: 600 })}>{t.connect.pasteJsonLead}</p>
              {pasteLink}
              <p className="text-xs" style={smallText("var(--text-secondary)", { marginTop: 8 })}>{t.connect.pasteJsonHint}</p>
            </div>
          </div>
        </div>
      )}

      {/* 채팅 AI: 스스로 못 올리니 "기다리는 중" 대신 답을 가져올 곳을 처음부터 보여준다 —
          답을 들고 창을 다시 연 사람이 또 복사를 누르지 않아도 되게. */}
      {path === "chat" && (
        <div className="mt-4 w-full rounded-2xl px-4 py-3.5 text-left" style={cardStyle}>
          <p className="text-xs" style={smallText("var(--text-primary)", { fontWeight: 600 })}>{t.connect.chatNextTitle}</p>
          <p className="text-xs" style={smallText("var(--text-secondary)", { marginTop: 4 })}>{t.connect.chatNextBody}</p>
          {pasteLink}
        </div>
      )}

      {error && (
        <p className="text-xs mt-3" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>{error}</p>
      )}

      {/* 접힘: 프롬프트 전문 */}
      {(path === "terminal" || path === "chat") && (
        <div className="w-full mt-6 text-left">
          <button type="button" onClick={() => setShowPrompt(v => !v)} aria-expanded={showPrompt} style={toggleStyle}>
            {chevron(showPrompt)}{t.connect.previewToggle}
          </button>
          {showPrompt && (
            <pre className="text-xs p-3 rounded-lg mt-2" style={{ ...preStyle, wordBreak: "normal", maxHeight: 220, overflowY: "auto" }}>
              {pastePrompt(origin, locale)}
            </pre>
          )}
        </div>
      )}

      {/* 접힘: MCP 연결 — 터미널 AI는 붙여넣기 자체가 없어진다(인터뷰 ⑦) */}
      {path === "terminal" && (
        <div className="w-full mt-3 text-left">
          <button type="button" onClick={() => setShowMcp(v => !v)} aria-expanded={showMcp} style={toggleStyle}>
            {chevron(showMcp)}{t.connect.mcpToggle}
          </button>
          {showMcp && (
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-xs" style={smallText("var(--text-secondary)", { lineHeight: 1.7 })}>{t.connect.mcpLead}</p>
              {([
                { kind: "claude-code" as const, label: t.connect.mcpClaudeCode, text: mcpClaudeCodeCommand(t.connect.mcpKeyPlaceholder) },
                { kind: "json" as const, label: t.connect.mcpJson, text: mcpConfigJson(t.connect.mcpKeyPlaceholder) },
              ]).map(({ kind, label, text }) => (
                <div key={kind}>
                  <p className="text-xs" style={smallText("var(--text-primary)", { fontWeight: 600, marginBottom: 6 })}>{label}</p>
                  <pre className="text-xs p-3 rounded-lg" style={preStyle}>{text}</pre>
                  <div className="flex items-center gap-3 flex-wrap mt-2">
                    <button type="button" onClick={() => copyMcp(kind)} disabled={mcpBusy} className="vf-button-ghost" style={{ fontSize: "0.75rem", padding: "0.35rem 0.8rem", opacity: mcpBusy ? 0.6 : 1 }}>
                      {mcpBusy ? t.connect.mcpCopying : t.connect.mcpCopy}
                    </button>
                    {mcpCopied === kind && (
                      <span className="text-xs" style={smallText("var(--text-secondary)")}>{t.connect.mcpCopied}</span>
                    )}
                  </div>
                  {manualMcp?.kind === kind && <div className="mt-2"><ManualCopyBox text={manualMcp.text} rows={4} /></div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 접힘: 연결 관리(발급된 토큰) — 없으면 아예 안 그린다. 답과 상관없이 맨 아래. */}
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
