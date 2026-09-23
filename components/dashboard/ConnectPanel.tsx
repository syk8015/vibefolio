"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { copyText, copyTextLater } from "@/lib/clipboard";
import { ManualCopyBox } from "@/components/dashboard/ManualCopyBox";
import { AI_TOOL_PATHS } from "@/components/dashboard/aiToolPaths";
import { PasteReply } from "@/components/publish/PasteReply";
import { FoldToggle } from "@/components/FoldToggle";
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
//
// 두 줄 개편(2026-09-22 사용자 확정): 답을 "쓰는 곳"(터미널·앱·웹)이 아니라 "할 수 있는
// 일"로 나눈다 — 명령을 직접 실행하는 AI / 채팅만 하는 AI. 쓰는 곳으로 나누면 Claude
// Code·Codex가 두 줄에 겹치고, Claude 데스크탑 앱은 대화와 Code 탭이 한 앱이라 또
// 갈라야 했다. 각 줄 안은 도구 로고 칩이고, 줄이 곧 누른 뒤 나오는 길이다(Claude 채팅만
// 커넥터라는 예외).
//
// 원할 때만 보여준다(2026-09-23 사용자 확정 — 브랜드 철학): 바이브코더는 AI의 중간 과정을
// 하나하나 읽지 않는다. 지금 할 일 하나만 보이고, 이유·세부·다른 방법은 접힌 줄(FoldToggle)
// 뒤에 둔다. 도구를 고르면 칩 10개는 한 줄로 접히고([바꾸기]로 다시 연다) 그 길의 단계만
// 남는다. 채팅 AI는 두 단계(프롬프트 복사 → 클립보드에서 올리기)이고 지금 차례인 버튼만
// 진하게 그린다. 예외 — 공개 범위(창 부제)와 실패(직접 복사 칸·오류 문구)는 늘 보인다.
type AiPath = "terminal" | "claude" | "chat";
type ToolId =
  | "claude-code" | "codex" | "cursor" | "copilot" | "antigravity" | "other-cli"
  | "claude-chat" | "chatgpt" | "gemini" | "other-chat";
const TOOL_KEY = "nf.connect.tool";
// 폰 2칸·PC 3칸 격자에 딱 맞게 6개(2026-09-22 — 한 칸만 남는 줄이 비대칭으로 보였다).
const AGENT_TOOLS: ToolId[] = ["claude-code", "codex", "cursor", "copilot", "antigravity", "other-cli"];
const CHAT_TOOLS: ToolId[] = ["claude-chat", "chatgpt", "gemini", "other-chat"];

/** 칩 앞 로고 — 단색 경로. 로고가 없는 것은 흉내 내지 않고 중립 기호로 둔다. */
function ToolIcon({ id }: { id: ToolId }) {
  const d =
    id === "claude-code" || id === "claude-chat" ? AI_TOOL_PATHS.claude
      : id === "codex" || id === "chatgpt" ? AI_TOOL_PATHS.openai
        : id === "cursor" ? AI_TOOL_PATHS.cursor
          : id === "copilot" ? AI_TOOL_PATHS.copilot
          : id === "gemini" ? AI_TOOL_PATHS.gemini
            : null;
  if (d) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d={d} fill="currentColor" />
      </svg>
    );
  }
  const glyph = id === "antigravity" ? "A" : id === "other-cli" ? ">_" : "…";
  return (
    <span aria-hidden="true" className="vf-mono" style={{
      width: 16, height: 16, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: id === "other-cli" ? "0.55rem" : "0.65rem", fontWeight: 700, borderRadius: 4,
      boxShadow: "inset 0 0 0 1.2px currentColor",
    }}>{glyph}</span>
  );
}

export default function ConnectPanel() {
  const { t, locale } = useT();
  const [tool, setTool] = useState<ToolId | null>(null);
  // Claude 채팅인데 커넥터를 못 쓰는 계정 → 프롬프트 길로 돌린다(칩은 그대로 Claude 채팅).
  const [promptInstead, setPromptInstead] = useState(false);
  const path: AiPath | null = !tool ? null
    : AGENT_TOOLS.includes(tool) ? "terminal"
      : tool === "claude-chat" && !promptInstead ? "claude"
        : "chat";
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
  const [mcpBusy, setMcpBusy] = useState(false);
  const [mcpCopied, setMcpCopied] = useState<"claude-code" | "json" | null>(null);
  // 원격 커넥터 주소 복사(2026-09-17). 위 둘과 달리 **토큰을 발급하지 않는다** —
  // 공개 주소 하나를 복사할 뿐이고, 인증은 클로드가 띄우는 [허용] 화면에서 일어난다.
  const [urlCopied, setUrlCopied] = useState(false);
  // 터미널 AI가 답만 주고 끝났을 때 펼치는 붙여넣기 칸.
  const [showPaste, setShowPaste] = useState(false);
  // 도구를 고른 뒤 [바꾸기]로 칩을 다시 편 상태. 고르면 다시 접힌다.
  const [chooserOpen, setChooserOpen] = useState(false);
  const [showWhich, setShowWhich] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // 주소 자동 복사가 막힌 브라우저 — 주소를 직접 복사 칸에 펼친다.
  const [urlCopyFailed, setUrlCopyFailed] = useState(false);
  // 창 안 붙여넣기 성공 뒤의 폴백 타이머(아래 onPasted).
  const pastedTimer = useRef<number | null>(null);
  useEffect(() => () => { if (pastedTimer.current) window.clearTimeout(pastedTimer.current); }, []);
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
      const saved = localStorage.getItem(TOOL_KEY) as ToolId | null;
      if (saved && [...AGENT_TOOLS, ...CHAT_TOOLS].includes(saved)) setTool(saved);
    } catch {
      // 저장소가 막힌 브라우저 — 매번 묻는 것으로 충분하다.
    }
  }, []);

  function choose(id: ToolId) {
    setChooserOpen(false);
    // 같은 칩을 다시 누른 것(바꾸기를 잘못 누른 경우)이면 진행 표시를 지우지 않는다.
    if (id !== tool) {
      setTool(id);
      setPromptInstead(false);
      setCopiedOnce(false);
      setManualPrompt(null);
      setUrlCopied(false);
      setUrlCopyFailed(false);
      setShowPaste(false);
    }
    setError(null);
    try { localStorage.setItem(TOOL_KEY, id); } catch { /* 위와 같음 */ }
  }

  async function copyRemoteUrl() {
    setError(null);
    const ok = await copyText(remoteMcpUrl(origin));
    if (!ok) {
      setUrlCopyFailed(true);
      return;
    }
    setUrlCopyFailed(false);
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

  const smallText = (color: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
    color, fontFamily: "var(--font-nunito)", lineHeight: 1.6, margin: 0, ...extra,
  });
  const preStyle: React.CSSProperties = {
    background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-mono), monospace",
    whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0, wordBreak: "break-all",
  };
  // 창 안에서 바로 올린다(D6, 2026-09-22). 새 초안이면 ProjectsTab의 도착 감지가 이 창을
  // 닫고 확인 화면을 연다. 같은 주소의 기존 초안을 **갱신**한 경우엔 새 행이 없어 도착
  // 감지가 안 울린다 — 잠시 기다려도 이 창이 그대로면 확인 화면 딥링크로 직접 간다.
  // (ProjectsTab은 다른 세션 소유라 콜백을 늘리지 않고 이 창 안에서 끝낸다.)
  function onPasted(projectId: string) {
    if (pastedTimer.current) window.clearTimeout(pastedTimer.current);
    pastedTimer.current = window.setTimeout(() => {
      window.location.assign(`/dashboard?review=${encodeURIComponent(projectId)}`);
    }, 2500);
  }


  const toolName = (id: ToolId): string =>
    id === "claude-code" ? "Claude Code"
      : id === "codex" ? "Codex"
        : id === "cursor" ? "Cursor"
          : id === "copilot" ? "GitHub Copilot"
          : id === "antigravity" ? "Antigravity"
            : id === "other-cli" ? t.connect.toolOtherCli
              : id === "claude-chat" ? t.connect.toolClaudeChat
                : id === "chatgpt" ? "ChatGPT"
                  : id === "gemini" ? "Gemini"
                    : t.connect.toolOtherChat;
  const group = (title: string, ids: ToolId[], cols: string) => (
    <div className="w-full">
      <p className="text-xs" style={smallText("var(--text-primary)", { fontWeight: 600 })}>{title}</p>
      <div role="radiogroup" aria-label={title} className={`grid grid-cols-2 gap-2 mt-2 ${cols}`}>
        {ids.map((id) => {
          const on = tool === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(id)}
              className="rounded-xl flex items-center gap-2 text-left"
              style={{
                padding: "0.6rem 0.75rem", minHeight: 48,
                background: on ? "var(--surface)" : "var(--surface-soft)",
                boxShadow: on ? "inset 0 0 0 1.5px var(--text-primary)" : "none",
                color: "var(--text-primary)", border: "none", cursor: "pointer",
                transition: "box-shadow 0.15s, background 0.15s",
              }}
            >
              <ToolIcon id={id} />
              <span className="text-sm" style={{ fontFamily: "var(--font-nunito)", fontWeight: 600, lineHeight: 1.3 }}>{toolName(id)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
  const num = (n: number) => (
    <span aria-hidden="true" className="vf-mono shrink-0 inline-flex items-center justify-center rounded-full" style={{
      width: 20, height: 20, fontSize: "0.7rem", fontWeight: 700,
      background: "var(--surface-soft)", color: "var(--text-secondary)",
    }}>{n}</span>
  );
  // 번호 단계 — 화살표 한 줄은 폰에서 가운데 정렬로 쪼개져 읽기 어려웠다(2026-09-22 사용자 지적).
  // tags: 단계 끝에 붙는 옅은 꼬리표(예: "처음 한 번만").
  const steps = (items: string[], tags: Record<number, string> = {}) => (
    <ol className="w-full flex flex-col gap-2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((line, i) => (
        <li key={i} className="flex items-start gap-2.5">
          {num(i + 1)}
          <span className="text-sm" style={smallText("var(--text-secondary)", { lineHeight: 1.6, paddingTop: 1 })}>
            {line}
            {tags[i] && <span className="text-xs" style={{ color: "var(--text-muted)", marginLeft: 6 }}>{tags[i]}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
  // 복사한 뒤 = AI가 올려주기를 기다리는 시간. 초안이 도착하면 ProjectsTab이 이 모달을 닫고
  // 검토 화면을 연다(useDraftArrival) — 그때까지의 한 줄.
  const waiting = (text: string) => (
    <div className="flex items-center gap-2.5" role="status">
      <span className="vf-spinner shrink-0" style={{ width: "0.9rem", height: "0.9rem" }} />
      <p className="text-sm" style={smallText("var(--text-secondary)")}>{text}</p>
    </div>
  );
  // 프롬프트 복사 버튼. 채팅 AI의 두 단계에서는 복사를 마치면 옅어지고 다음 단계가 진해진다.
  const prompted = copiedOnce || manualPrompt !== null;
  const copyButton = (look: "primary" | "ghost", big: boolean) => (
    <button
      type="button"
      onClick={copyPromptWithCode}
      disabled={copying}
      className={`${look === "primary" ? "vf-button-primary" : "vf-button-ghost"} w-full sm:w-auto sm:self-start`}
      style={{
        fontSize: big ? "0.95rem" : "0.9rem", padding: big ? "0.85rem 2.2rem" : "0.7rem 1.5rem", opacity: copying ? 0.6 : 1,
        // 복사됐다는 걸 버튼 스스로 말하게 한다(2026-09-05 사용자 지적) —
        // 라벨이 ✓로 바뀌고 살짝 커진다. 아래 작은 문구만으로는 눌린 티가 안 났다.
        transform: big && copiedOnce ? "scale(1.03)" : "scale(1)",
        transition: "transform 0.22s cubic-bezier(0.34, 1.4, 0.64, 1)",
      }}
    >
      {copying ? t.connect.copying : copiedOnce ? t.connect.copiedButton : t.connect.copyPrompt}
    </button>
  );

  const showChooser = !tool || chooserOpen;
  const showPath = path !== null && !showChooser;

  return (
    // keep-all: 폰에서 "붙여넣어/요."처럼 한 글자만 다음 줄로 떨어지지 않게 단어 단위로 접는다
    // (.vf-review와 같은 처방). 주소·명령 <pre>는 각자 break-all이라 영향 없다.
    <div className="flex flex-col items-stretch text-left gap-5" style={{ wordBreak: "keep-all", overflowWrap: "break-word" }}>
      {/* 첫 질문 — 두 줄(할 수 있는 일)로 나눈 도구 칩. 두 줄의 설명은 헷갈리는 사람만 편다. */}
      {showChooser && (
        <>
          <p className="text-base" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, margin: 0 }}>
            {t.connect.ask}
          </p>
          {group(t.connect.groupAgent, AGENT_TOOLS, "sm:grid-cols-3")}
          {group(t.connect.groupChat, CHAT_TOOLS, "sm:grid-cols-4")}
          <div className="w-full">
            <FoldToggle open={showWhich} onToggle={() => setShowWhich((v) => !v)}>{t.connect.whichToggle}</FoldToggle>
            {showWhich && (
              <div className="mt-2 flex flex-col gap-1">
                <p className="text-xs" style={smallText("var(--text-secondary)", { lineHeight: 1.7 })}>
                  <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{t.connect.groupAgent}</strong> — {t.connect.groupAgentNote}
                </p>
                <p className="text-xs" style={smallText("var(--text-secondary)", { lineHeight: 1.7 })}>
                  <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{t.connect.groupChat}</strong> — {t.connect.groupChatNote}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* 고른 뒤 — 칩 10개 대신 고른 것 한 줄. 지난번 답을 기억해 두었다면 창을 열자마자 이 줄이다. */}
      {tool && !showChooser && (
        <div className="w-full rounded-xl flex items-center justify-between gap-3" style={{ minHeight: 48, padding: "0.5rem 0.5rem 0.5rem 0.85rem", background: "var(--surface-soft)" }}>
          <span className="flex items-center gap-2 min-w-0" style={{ color: "var(--text-primary)" }}>
            <ToolIcon id={tool} />
            <span className="text-sm truncate" style={{ fontFamily: "var(--font-nunito)", fontWeight: 600, lineHeight: 1.3 }}>{toolName(tool)}</span>
          </span>
          <button
            type="button"
            onClick={() => setChooserOpen(true)}
            className="rounded-full shrink-0"
            style={{ padding: "0.45rem 0.9rem", background: "var(--surface)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            {t.connect.changeTool}
          </button>
        </div>
      )}

      {/* 명령을 직접 실행하는 AI — 프롬프트 복사가 첫 동작. 복사하면 기다리는 한 줄로 바뀐다. */}
      {showPath && path === "terminal" && (
        <div className="w-full flex flex-col gap-4">
          {steps(t.connect.stepsTerminal(tool && tool !== "other-cli" ? toolName(tool) : null))}
          {copyButton("primary", true)}
          {manualPrompt && <ManualCopyBox text={manualPrompt} />}
          {prompted && (
            <div className="flex flex-col gap-2.5">
              {waiting(t.connect.waitingAi)}
              {/* 터미널 AI가 예상과 달리 답만 주고 끝났을 때의 출구(2026-09-18). */}
              <div className="w-full">
                <FoldToggle open={showPaste} onToggle={() => setShowPaste((v) => !v)}>{t.connect.pasteJsonLead}</FoldToggle>
                {showPaste && (
                  <div className="mt-2.5">
                    <PasteReply compact onSuccess={onPasted} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Claude 채팅 — 원격 커넥터(2026-09-17). 단계는 Claude 앱 자체의 화면이라 줄일 수 없고,
          대신 처음 한 번뿐이다. 막힐 때의 이야기(요금제·계정 제한·프롬프트로 하기)는 접어 둔다. */}
      {showPath && path === "claude" && (
        <div className="w-full flex flex-col gap-4">
          {steps(t.connect.stepsClaude, { 1: t.connect.claudeOnceTag })}
          <button type="button" onClick={() => void copyRemoteUrl()} className="vf-button-primary w-full sm:w-auto sm:self-start" style={{ fontSize: "0.95rem", padding: "0.85rem 2.2rem" }}>
            {urlCopied ? t.connect.copiedButton : t.connect.mcpRemoteCopy}
          </button>
          {urlCopyFailed && <ManualCopyBox text={remoteMcpUrl(origin)} rows={1} />}
          {urlCopied && waiting(t.connect.waitingClaude)}
          <div className="w-full">
            <FoldToggle open={showHelp} onToggle={() => setShowHelp((v) => !v)}>{t.connect.claudeHelpToggle}</FoldToggle>
            {showHelp && (
              <div className="mt-2 flex flex-col gap-1">
                <p className="text-xs" style={smallText("var(--text-secondary)", { lineHeight: 1.7 })}>{t.connect.claudeAllowHint}</p>
                <p className="text-xs" style={smallText("var(--text-secondary)", { lineHeight: 1.7 })}>{t.connect.mcpRemoteCaveat}</p>
                <p className="text-xs" style={smallText("var(--text-secondary)", { lineHeight: 1.7 })}>
                  {t.connect.claudeFallback}
                  <button type="button" onClick={() => setPromptInstead(true)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontSize: "0.75rem", fontWeight: 600, textDecoration: "underline", display: "inline" }}>
                    {t.connect.claudeFallbackLink}
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 채팅만 하는 AI — 스스로 못 올리니 두 단계. 답을 들고 창을 다시 연 사람이 또 복사를
          누르지 않아도 되게 2단계 버튼도 처음부터 누를 수 있다(D6). */}
      {showPath && path === "chat" && (
        <ol className="w-full flex flex-col" style={{ listStyle: "none", padding: 0, margin: 0, gap: 22 }}>
          <li className="flex items-start gap-2.5">
            {num(1)}
            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
              <span className="text-sm" style={smallText("var(--text-secondary)", { paddingTop: 1 })}>{t.connect.chatStep1}</span>
              {copyButton(prompted ? "ghost" : "primary", false)}
              {manualPrompt && <ManualCopyBox text={manualPrompt} />}
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            {num(2)}
            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
              <span className="text-sm" style={smallText("var(--text-secondary)", { paddingTop: 1 })}>{t.connect.chatStep2}</span>
              <PasteReply compact emphasis={prompted ? "primary" : "ghost"} onSuccess={onPasted} />
            </div>
          </li>
        </ol>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)", margin: 0 }}>{error}</p>
      )}

      {/* 접힘: 프롬프트 전문 + MCP 연결(터미널 AI는 붙여넣기 자체가 없어지는 길, 인터뷰 ⑦) */}
      {showPath && path === "terminal" && (
        <div className="w-full">
          <FoldToggle open={showPrompt} onToggle={() => setShowPrompt((v) => !v)}>{t.connect.moreToggle}</FoldToggle>
          {showPrompt && (
            <div className="mt-2 flex flex-col gap-3">
              <pre className="text-xs p-3 rounded-lg" style={{ ...preStyle, wordBreak: "normal", maxHeight: 220, overflowY: "auto" }}>
                {pastePrompt(origin, locale)}
              </pre>
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

      {/* 접힘: 프롬프트 전문(채팅 AI) */}
      {showPath && path === "chat" && (
        <div className="w-full">
          <FoldToggle open={showPrompt} onToggle={() => setShowPrompt((v) => !v)}>{t.connect.previewToggle}</FoldToggle>
          {showPrompt && (
            <pre className="text-xs p-3 rounded-lg mt-2" style={{ ...preStyle, wordBreak: "normal", maxHeight: 220, overflowY: "auto" }}>
              {pastePrompt(origin, locale)}
            </pre>
          )}
        </div>
      )}

      {/* 접힘: 연결 관리(발급된 토큰) — 없으면 아예 안 그린다. 답과 상관없이 맨 아래,
          바로 위 접힌 줄과 붙여 둔다. */}
      {tokens.length > 0 && (
        <div className="w-full" style={{ marginTop: -8 }}>
          <FoldToggle open={showTokens} onToggle={() => setShowTokens((v) => !v)}>{t.connect.tokensToggle(tokens.length)}</FoldToggle>
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
