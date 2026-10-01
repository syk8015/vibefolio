"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/client";
import { copyTextLater } from "@/lib/clipboard";
import { AUTO_TOKEN_NAME, MCP_TOKEN_NAME, mcpClaudeCodeCommand, mcpConfigJson, pastePrompt } from "@/lib/connectSnippets";
import { AI_TOOL_PATHS } from "@/components/dashboard/aiToolPaths";
import { ManualCopyBox } from "@/components/dashboard/ManualCopyBox";
import { FoldToggle } from "@/components/FoldToggle";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { InlineConfirm, List, Row, Section, TEXT, pillStyle } from "./ui";

// 설정 "AI 연결"(2026-09-26) — AI 도구에 준 연결(api_tokens)을 보고 끊는다(/api/tokens/[id] DELETE).
//
// 라 시안(2026-10-01 덜어내기): 연결 창에 있던 MCP 연결(명령·설정 복사 — 누를 때 내 열쇠를 새로
// 발급해 채운다)과 연결 관리가 여기로 옮겨 왔다. 연결 창은 "올리기" 하나만 하고, 가끔 쓰는 이 둘은
// 여기가 정본이다(창 맨 아래 링크가 #ai로 데려온다). 무엇이 복사되는지는 맨 아래 접힌 줄에서 본다.
//
// 업그레이드(2026-10-01): 연결 줄마다 무엇으로 이어졌는지 표시(프롬프트 = 터미널, claude.ai 커넥터 =
// Claude, MCP·그 밖 = 플러그 — 로그인 관리 줄과 같은 18px 자리)와 작은 점(최근 7일 안에 쓰였으면 초록,
// 아니면 옅은 회색). 점은 바로 옆 "최근 사용 …/사용 전" 글이 이미 말하는 것을 한눈에 보이게 할 뿐이다.
interface TokenRow {
  id: string;
  token_prefix: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}
type McpKind = "claude-code" | "json";

function tokenName(name: string | null, t: Dictionary): string {
  if (name === AUTO_TOKEN_NAME) return t.connect.autoTokenName;
  if (name === MCP_TOKEN_NAME) return t.connect.mcpTokenName;
  // 원격 커넥터(OAuth)는 lib/oauth가 `oauth:<호스트>`로 적는다.
  if (name?.startsWith("oauth:")) return t.settings.oauthTokenName(name.slice("oauth:".length));
  return name || t.connect.unnamed;
}

function fetchTokens() {
  return createClient()
    .from("api_tokens")
    .select("id, token_prefix, name, created_at, last_used_at")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
}

const CLAUDE_ORANGE = "#D97757";
// 성공·켜짐의 초록 — 복사 완료 표시(CopyLinkButton)와 같은 값. 라이트·다크 바탕 둘 다에서 보인다.
const ACTIVE_GREEN = "#22c55e";
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const OPENAI_HOSTS = new Set(["chatgpt.com", "chat.openai.com", "openai.com"]);

/** 연결이 어디로 이어졌는지 — 공식 로고가 있는 건 그 로고, 없으면 같은 굵기의 선 아이콘. */
function ConnectionIcon({ name }: { name: string | null }) {
  const host = name?.startsWith("oauth:") ? name.slice("oauth:".length).toLowerCase() : null;
  // 주소가 정확히 그 회사일 때만 공식 로고 — "claude"가 들어간 남의 주소(claude-helper.dev 등)가
  // Claude처럼 보이면 끊을 연결을 고를 때 속는다(연결 허락 화면 ConnectPair와 같은 규칙).
  const logo = host === "claude.ai" ? { d: AI_TOOL_PATHS.claude, fill: CLAUDE_ORANGE }
    : host && OPENAI_HOSTS.has(host) ? { d: AI_TOOL_PATHS.openai, fill: "currentColor" }
      : null;
  if (logo) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d={logo.d} fill={logo.fill} />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === AUTO_TOKEN_NAME ? (
        // 프롬프트 = `npx nookframe login <코드>`를 돌린 터미널 AI
        <>
          <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
          <path d="m7.5 10 3 2.5-3 2.5M12.5 15.5h4" />
        </>
      ) : (
        // MCP 연결·그 밖의 연결 — 꽂아 둔 플러그
        <>
          <path d="M9 3.5v4M15 3.5v4" />
          <path d="M6.5 7.5h11V11a5.5 5.5 0 0 1-11 0z" />
          <path d="M12 16.5v4" />
        </>
      )}
    </svg>
  );
}

export default function AiConnections() {
  const { t, locale } = useT();
  const ts = t.settings;
  const tc = t.connect;
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  // 목록을 받은 시각 — "최근 7일" 점의 기준(그리는 중엔 시계를 읽지 않는다).
  const [loadedAt, setLoadedAt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revokeFailed, setRevokeFailed] = useState(false);
  // MCP 연결(2026-09-04, 인터뷰 ⑦): 내 열쇠를 채운 명령/설정을 복사한다. 자동 복사가 막히면 받은 글을
  // 직접 복사 칸에 펼친다(그 열쇠는 이미 살아 있으니 버리지 않는다).
  const [mcpBusy, setMcpBusy] = useState<McpKind | null>(null);
  const [mcpCopied, setMcpCopied] = useState(false);
  const [manualMcp, setManualMcp] = useState<string | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchTokens().then(({ data, error }) => {
      if (!alive) return;
      if (error) setLoadFailed(true);
      else {
        setLoadedAt(Date.now());
        setTokens((data as TokenRow[]) ?? []);
      }
    });
    return () => { alive = false; };
  }, []);

  async function reload() {
    const { data, error } = await fetchTokens();
    if (error) return;
    setLoadFailed(false);
    setLoadedAt(Date.now());
    setTokens((data as TokenRow[]) ?? []);
  }

  async function revoke(id: string) {
    setBusy(id);
    setRevokeFailed(false);
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    setConfirmId(null);
    if (!res || !res.ok) {
      setRevokeFailed(true);
      return;
    }
    setTokens((list) => list && list.filter((row) => row.id !== id));
  }

  // 발급+복사 원자 흐름. 복사는 fetch보다 **먼저** 시작해야 사파리가 허락한다(copyTextLater) —
  // await를 앞에 두지 말 것. 누를 때마다 새 열쇠, 이전 MCP 열쇠는 서버가 바로 끊는다.
  function copyMcp(kind: McpKind) {
    if (mcpBusy) return;
    setMcpBusy(kind);
    setMcpError(null);
    setMcpCopied(false);
    setManualMcp(null);
    let text = "";
    const ready = fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mcp: true }),
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || tc.issueFailed);
      text = kind === "claude-code" ? mcpClaudeCodeCommand(body.token as string) : mcpConfigJson(body.token as string);
      return text;
    });
    copyTextLater(ready)
      .then(async (ok) => {
        if (ok) setMcpCopied(true);
        else setManualMcp(text);
        await reload();
      })
      .catch((err) => setMcpError(err instanceof TypeError ? tc.networkFailed : (err as Error).message))
      .finally(() => setMcpBusy(null));
  }

  const count = tokens?.length ?? 0;
  const locked = busy !== null;
  const dateFmt = (iso: string) => new Date(iso).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US");
  const origin = typeof window !== "undefined" ? window.location.origin : "https://nookframe.com";
  const note = (color: string): React.CSSProperties => ({ ...TEXT, fontSize: "0.8125rem", color, margin: "10px 0 0" });
  const preStyle: React.CSSProperties = {
    background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace",
    whiteSpace: "pre-wrap", wordBreak: "normal", overflowWrap: "anywhere", lineHeight: 1.6, fontSize: "0.8125rem",
    margin: "6px 0 0", padding: "0.75rem", borderRadius: 10, maxHeight: 220, overflowY: "auto",
  };

  return (
    // 연결 창의 "MCP·연결 관리는 설정에서"가 여기로 온다(#ai). 위 고정 머리줄에 가리지 않게 여백을 둔다.
    <div id="ai" style={{ scrollMarginTop: 88 }}>
      <Section label={ts.aiLabel}>
        {revokeFailed && <p role="alert" className="text-sm mb-3" style={{ ...TEXT, color: "var(--danger)" }}>{tc.revokeFailed}</p>}
        <List>
          <Row name={tc.mcpTitle} detail={tc.mcpLead}>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => copyMcp("claude-code")} disabled={mcpBusy !== null}
                style={{ ...pillStyle(mcpBusy !== null), display: "inline-flex", alignItems: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d={AI_TOOL_PATHS.claude} fill={CLAUDE_ORANGE} />
                </svg>
                {mcpBusy === "claude-code" ? tc.mcpCopying : tc.mcpClaudeCode}
              </button>
              <button type="button" onClick={() => copyMcp("json")} disabled={mcpBusy !== null} style={pillStyle(mcpBusy !== null)}>
                {mcpBusy === "json" ? tc.mcpCopying : tc.mcpJson}
              </button>
            </div>
            {mcpCopied && <p role="status" style={note("var(--text-secondary)")}>{tc.mcpCopied}</p>}
            {manualMcp && <div className="mt-3"><ManualCopyBox text={manualMcp} rows={4} /></div>}
            {mcpError && <p role="alert" style={note("var(--danger)")}>{mcpError}</p>}
          </Row>
          <Row divider name={ts.aiConnected(count)}
            detail={loadFailed ? ts.aiLoadFailed : tokens === null ? "…" : count === 0 ? ts.aiEmpty : undefined} />
          {tokens?.map((row) => (
            <Row key={row.id} divider icon={<ConnectionIcon name={row.name} />} name={tokenName(row.name, t)}
              // 앞자리만 고정폭 — 날짜까지 고정폭이면 폰에서 "2026. 9. / 22."처럼 날짜 가운데가 끊겼다.
              detail={
                <>
                  <span aria-hidden="true" className="inline-block rounded-full" style={{
                    width: 7, height: 7, marginRight: 7, verticalAlign: 1,
                    ...(row.last_used_at && loadedAt - Date.parse(row.last_used_at) < RECENT_MS
                      ? { background: ACTIVE_GREEN }
                      : { background: "var(--text-muted)", opacity: 0.5 }),
                  }} />
                  <span className="vf-mono">{row.token_prefix}</span>
                  {" · "}
                  <span style={{ whiteSpace: "nowrap" }}>
                    {row.last_used_at ? tc.lastUsed(dateFmt(row.last_used_at)) : tc.neverUsed}
                  </span>
                </>
              }
              action={confirmId === row.id ? undefined : (
                <button type="button" disabled={locked}
                  onClick={() => { setConfirmId(row.id); setRevokeFailed(false); }}
                  style={pillStyle(locked)}>
                  {tc.revoke}
                </button>
              )}>
              {confirmId === row.id && (
                <InlineConfirm indent locked={locked}
                  text={tc.revokeConfirm}
                  yes={busy === row.id ? ts.revoking : tc.revoke}
                  no={ts.cancel}
                  onYes={() => revoke(row.id)}
                  onNo={() => setConfirmId(null)} />
              )}
            </Row>
          ))}
        </List>
        {/* 무엇이 복사되는지(연결 창의 프롬프트 · MCP 명령·설정) — 원할 때만. 열쇠·코드 자리는 비워 둔 모양. */}
        <div className="mt-3">
          <FoldToggle open={showPreview} onToggle={() => setShowPreview((v) => !v)}>{ts.aiPreview}</FoldToggle>
          {showPreview && (
            <div className="mt-2 flex flex-col gap-3">
              {[
                { label: ts.aiPreviewPrompt, text: pastePrompt(origin, locale) },
                { label: ts.aiPreviewCommand, text: mcpClaudeCodeCommand(tc.mcpKeyPlaceholder) },
                { label: ts.aiPreviewConfig, text: mcpConfigJson(tc.mcpKeyPlaceholder) },
              ].map(({ label, text }) => (
                <div key={label}>
                  <p style={{ ...TEXT, fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{label}</p>
                  <pre style={preStyle}>{text}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
