"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { copyText, copyTextLater } from "@/lib/clipboard";
import { ManualCopyBox } from "@/components/dashboard/ManualCopyBox";
import { AI_TOOL_PATHS } from "@/components/dashboard/aiToolPaths";
import { JourneyStrip, StepCheckIcon, type JourneyIcon, type JourneyState, type JourneyStep } from "@/components/dashboard/JourneyStrip";
import { PasteReply } from "@/components/publish/PasteReply";
import { DraftMiniCard, descriptionLines } from "@/components/publish/DraftPreview";
import { pastePrompt, remoteMcpUrl } from "@/lib/connectSnippets";
import { useT } from "@/lib/i18n/client";
import { aiStarted } from "@/lib/connectActivity";

// AI 연결 창 — AddProjectModal의 본문(추가 진입점 재구조 08-14).
//
// [프롬프트 복사]가 눌리는 순간 서버가 1회용 연결 코드를 발급하고(09-16부터 토큰 대신 코드),
// 코드가 든 프롬프트를 통째로 클립보드에 넣는다. 자동 복사가 막힌 브라우저에서만 받은 글을
// 직접 복사 칸(ManualCopyBox)에 펼친다(A2, 2026-09-22).
//
// "어떤 AI로 만들었나요?"(2026-09-22): 도구 칩을 "할 수 있는 일"로 두 줄에 나눈다 — 명령을
// 직접 실행하는 AI / 채팅만 하는 AI. 줄이 곧 누른 뒤 나오는 길이다(Claude 채팅만 커넥터라는 예외).
// 새 통로는 없다 — 프롬프트 / 원격 커넥터 / AI 답 붙여넣기 셋의 순서만 답에 맞춰 바꾼다.
//
// 라 시안(2026-10-01 덜어내기, 사용자 확정): 제목 한 줄, 도구 한 줄, 큰 버튼 하나. 번호 단계와
// 설명 접힌 줄은 없앴다 — 버튼이 차례대로 이름을 바꾸며 다음 할 일을 말한다([프롬프트 복사] →
// 조용한 "복사했어요" 줄 → [AI 답 붙여넣기] → "초안이 왔어요"). 공개 범위 한 줄은 버튼 바로 아래에
// 늘 있고, 실패(오류 문구·직접 복사 칸·직접 붙여넣는 칸)도 숨기지 않는다. MCP 연결과 연결 관리는
// 설정 → AI 연결로 옮겼다 — 창엔 맨 아래 작은 링크 하나만 남는다.
//
// 업그레이드(2026-10-01, 사용자 확정 — 라 위에 보여 주는 그림만 더함): 창 머리의 가치 한 줄
// (AddProjectModal), 큰 버튼 위 3칸 진행 줄(JourneyStrip — 이 창의 실제 상태를 그대로 그린다),
// 고르기 화면의 "최근" 딱지, 창 안에서 올린 초안을 작은 어두운 명함 카드로.
type AiPath = "terminal" | "claude" | "chat";
type ToolId =
  | "claude-code" | "codex" | "cursor" | "copilot" | "antigravity" | "other-cli"
  | "claude-chat" | "chatgpt" | "gemini" | "other-chat";
const TOOL_KEY = "nf.connect.tool";
// 폰 2칸·PC 3칸 격자에 딱 맞게 6개(2026-09-22 — 한 칸만 남는 줄이 비대칭으로 보였다).
const AGENT_TOOLS: ToolId[] = ["claude-code", "codex", "cursor", "copilot", "antigravity", "other-cli"];
const CHAT_TOOLS: ToolId[] = ["claude-chat", "chatgpt", "gemini", "other-chat"];

// 칩 앞 로고(2026-09-22) + 브랜드 색(2026-09-24 사용자 요청 — 한눈에 알아보게).
// 공식 로고가 단색인 곳(OpenAI·Cursor·GitHub Copilot)은 글자색을 그대로 따른다 — 없는 색을
// 지어내지 않는다. 로고가 없는 것(Antigravity·그 밖의)은 흉내 내지 않고 중립 기호로 둔다.
// Claude = 공식 #D97757(simple-icons). Gemini = 2025 새 로고의 네 가지 색(위 빨강·오른쪽 파랑·
// 아래 초록·왼쪽 노랑) — SVG엔 원뿔 그라데이션이 없어, 로고 모양으로 도려낸 칸을 CSS로 칠한다.
const CLAUDE_ORANGE = "#D97757";
const GEMINI_FILL = "conic-gradient(from 0deg, #EE5257 0deg, #3A8BFF 70deg, #3A8BFF 150deg, #4CC88B 215deg, #D0C42E 285deg, #EE5257 360deg)";
const GEMINI_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${AI_TOOL_PATHS.gemini}'/></svg>`,
)}") center / contain no-repeat`;

function ToolIcon({ id }: { id: ToolId }) {
  if (id === "gemini") {
    return (
      <span aria-hidden="true" style={{
        width: 16, height: 16, flexShrink: 0, display: "inline-block",
        background: GEMINI_FILL, mask: GEMINI_MASK, WebkitMask: GEMINI_MASK,
      }} />
    );
  }
  const d =
    id === "claude-code" || id === "claude-chat" ? AI_TOOL_PATHS.claude
      : id === "codex" || id === "chatgpt" ? AI_TOOL_PATHS.openai
        : id === "cursor" ? AI_TOOL_PATHS.cursor
          : id === "copilot" ? AI_TOOL_PATHS.copilot
            : null;
  if (d) {
    const fill = id === "claude-code" || id === "claude-chat" ? CLAUDE_ORANGE : "currentColor";
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d={d} fill={fill} />
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

// 복사한 뒤 AI가 실제로 움직였나(2026-09-30). 켜지는 순간의 값을 기준점으로 잡고 몇 초마다 다시
// 물어, 기준점 뒤 새 흔적(코드 교환·토큰 사용)이 생기면 true. 판정은 lib/connectActivity.ts.
// 30분(코드 수명)이 지나면 묻기를 그친다 — 그때까지 없으면 기존 기다림 문구가 그대로 남는다.
const ACTIVITY_POLL_MS = 5_000;
const ACTIVITY_POLL_MAX_MS = 30 * 60_000;
function useAiStarted(active: boolean): boolean {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    let baseline: string | null | undefined;
    const until = Date.now() + ACTIVITY_POLL_MAX_MS;
    const ask = async (): Promise<string | null | undefined> => {
      const res = await fetch("/api/connect/activity", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return undefined;
      const body = await res.json().catch(() => null);
      return typeof body?.latest === "string" ? body.latest : null;
    };
    const tick = async () => {
      if (stop) return;
      const latest = await ask();
      if (stop) return;
      if (latest !== undefined) {
        if (baseline === undefined) baseline = latest;
        else if (aiStarted(baseline, latest)) {
          setStarted(true);
          return;
        }
      }
      if (Date.now() < until) timer = window.setTimeout(tick, ACTIVITY_POLL_MS);
    };
    let timer = window.setTimeout(tick, 0);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      setStarted(false);
    };
  }, [active]);
  return started;
}

export default function ConnectPanel() {
  const { t, locale } = useT();
  const tc = t.connect;
  const [tool, setTool] = useState<ToolId | null>(null);
  // Claude 채팅인데 커넥터를 못 쓰는 계정 → 프롬프트 길로 돌린다(칩은 그대로 Claude 채팅).
  const [promptInstead, setPromptInstead] = useState(false);
  const path: AiPath | null = !tool ? null
    : AGENT_TOOLS.includes(tool) ? "terminal"
      : tool === "claude-chat" && !promptInstead ? "claude"
        : "chat";
  // 도구를 고른 뒤 [바꾸기]로 칩을 다시 편 상태. 고르면 다시 접힌다.
  const [chooserOpen, setChooserOpen] = useState(false);
  // 프롬프트 복사 — copies는 성공 횟수(0 = 아직). 조용한 "복사했어요" 줄이 다시 복사될 때마다 새로 떠오르게 key로도 쓴다.
  const [copying, setCopying] = useState(false);
  const [copies, setCopies] = useState(0);
  // 자동 복사가 막혔을 때(사파리 등) 받은 글을 펼쳐 두는 칸 — A2(2026-09-22).
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Claude 채팅의 커넥터 주소 복사(2026-09-17). **토큰을 발급하지 않는다** — 공개 주소 하나를
  // 복사할 뿐이고, 인증은 Claude가 띄우는 [허용] 화면에서 일어난다. manual = 자동 복사가 막힌 브라우저.
  const [urlStep, setUrlStep] = useState<"idle" | "copied" | "manual">("idle");
  const [urlCopies, setUrlCopies] = useState(0);
  // 터미널 AI가 답만 주고 끝났을 때("답만 받았어요") 붙여넣기로 넘어간 상태.
  const [showPaste, setShowPaste] = useState(false);
  // 채팅 AI의 답을 들고 창을 다시 연 사람("AI 답을 이미 받았어요", D6) — 프롬프트를 또 복사하면
  // 클립보드의 답이 지워지므로 복사 없이 붙여넣기로 바로 간다.
  const [haveReply, setHaveReply] = useState(false);
  // 창 안에서 AI 답을 올린 직후 — "초안이 왔어요" + 그 초안의 작은 카드(제목·소개 세 줄).
  const [arrived, setArrived] = useState<{ id: string; title: string | null; description: string | null } | null>(null);
  // 붙여넣기 칸(PasteReply)에 실패 문구가 떠 있는 동안 — 진행 줄의 붙여넣기 칸이 빨간 테가 된다.
  const [pasteFailed, setPasteFailed] = useState(false);
  // 창을 연 순간 기억해 둔 도구(지난번 답) — 고르기 화면에서 그 칩에 "최근" 딱지. 이번에 바꿔도 그대로다.
  const [recentTool, setRecentTool] = useState<ToolId | null>(null);
  const pastedTimer = useRef<number | null>(null);
  useEffect(() => () => { if (pastedTimer.current) window.clearTimeout(pastedTimer.current); }, []);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://nookframe.com";
  const prompted = copies > 0 || manualPrompt !== null;
  const terminalStarted = useAiStarted(path === "terminal" && prompted && !showPaste && !arrived);
  const claudeStarted = useAiStarted(path === "claude" && urlStep !== "idle");

  // 지난번 답(어떤 AI) 복원. 훅 규칙은 setState를 보수 판정하지만 마운트 1회라 캐스케이드 렌더는 없다.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TOOL_KEY) as ToolId | null;
      if (saved && [...AGENT_TOOLS, ...CHAT_TOOLS].includes(saved)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTool(saved);
        setRecentTool(saved);
      }
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
      setCopies(0);
      setManualPrompt(null);
      setUrlStep("idle");
      setShowPaste(false);
      setHaveReply(false);
      setArrived(null);
      setPasteFailed(false);
    }
    setError(null);
    try { localStorage.setItem(TOOL_KEY, id); } catch { /* 위와 같음 */ }
  }

  async function copyRemoteUrl() {
    setError(null);
    const ok = await copyText(remoteMcpUrl(origin));
    if (!ok) {
      setUrlStep("manual");
      return;
    }
    setUrlStep("copied");
    setUrlCopies((n) => n + 1);
  }

  // 발급+복사 원자 흐름. 발급은 됐는데 클립보드가 실패하면 받은 글을 직접 복사 칸에 펼친다(그
  // 코드는 살아 있으니 버리지 않는다). 복사는 fetch보다 **먼저** 시작해야 사파리가 허락한다
  // (copyTextLater) — await를 앞에 두지 말 것. 다시 복사(조용한 줄 누르기)도 이 함수 — 늘 새 코드다.
  function copyPromptWithCode() {
    if (copying) return;
    setCopying(true);
    setError(null);
    // 프롬프트에 심는 것은 토큰이 아니라 **1회용 페어링 코드**다(2026-09-16). 이 프롬프트는 AI
    // 채팅창에 붙여넣는 물건이라, 토큰을 박으면 살아 있는 크리덴셜이 대화 기록에 영구히 남는다.
    // 토큰은 CLI `login <코드>`가 교환할 때 비로소 생긴다 — 복사만 하고 안 쓰면 아예 안 생긴다.
    let prompt = "";
    const ready = fetch("/api/connect/code", { method: "POST" }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || tc.issueFailed);
      prompt = pastePrompt(origin, locale, body.code as string);
      return prompt;
    });
    copyTextLater(ready)
      .then((ok) => {
        if (ok) {
          setCopies((n) => n + 1);
          setManualPrompt(null);
        } else {
          setCopies(0);
          setManualPrompt(prompt);
        }
      })
      .catch((err) => {
        setCopies(0);
        setManualPrompt(null);
        setError(err instanceof TypeError ? tc.networkFailed : (err as Error).message);
      })
      .finally(() => setCopying(false));
  }

  // 창 안에서 바로 올린다(D6, 2026-09-22). 새 초안이면 ProjectsTab의 도착 감지가 이 창을 닫고 확인
  // 화면을 연다. 같은 주소의 기존 초안을 **갱신**한 경우엔 새 행이 없어 도착 감지가 안 울린다 —
  // 잠시 기다려도 이 창이 그대로면 확인 화면 딥링크로 직접 간다. 그 사이엔 "초안이 왔어요".
  function openReview(projectId: string) {
    window.location.assign(`/dashboard?review=${encodeURIComponent(projectId)}`);
  }
  function onPasted(projectId: string, title: string | null, description: string | null) {
    setArrived({ id: projectId, title, description });
    if (pastedTimer.current) window.clearTimeout(pastedTimer.current);
    pastedTimer.current = window.setTimeout(() => openReview(projectId), 2500);
  }

  const toolName = (id: ToolId): string =>
    id === "claude-code" ? "Claude Code"
      : id === "codex" ? "Codex"
        : id === "cursor" ? "Cursor"
          : id === "copilot" ? "GitHub Copilot"
            : id === "antigravity" ? "Antigravity"
              : id === "other-cli" ? tc.toolOtherCli
                : id === "claude-chat" ? tc.toolClaudeChat
                  : id === "chatgpt" ? "ChatGPT"
                    : id === "gemini" ? "Gemini"
                      : tc.toolOtherChat;
  // "그 밖의" 칩은 이름 대신 "AI에게"로 말한다(안내 줄의 받는 쪽).
  const named = tool && tool !== "other-cli" && tool !== "other-chat" ? toolName(tool) : null;

  const group = (title: string, ids: ToolId[], cols: string) => (
    <div className="w-full">
      <p style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", fontWeight: 600, fontSize: "0.8125rem", lineHeight: 1.6, margin: 0 }}>{title}</p>
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
              className="relative rounded-xl flex items-center gap-2 text-left"
              style={{
                padding: "0.55rem 0.75rem", minHeight: 44,
                background: on ? "var(--surface)" : "var(--surface-soft)",
                boxShadow: on ? "inset 0 0 0 1.5px var(--text-primary)" : "none",
                color: "var(--text-primary)", border: "none", cursor: "pointer",
                transition: "box-shadow 0.15s, background 0.15s",
              }}
            >
              <ToolIcon id={id} />
              <span style={{ fontFamily: "var(--font-nunito)", fontWeight: 600, lineHeight: 1.3, fontSize: "0.9375rem" }}>{toolName(id)}</span>
              {id === recentTool && (
                // 칩 오른쪽 위에 걸친 작은 딱지 — 칩 글자를 밀지 않게 띄워 둔다.
                <span className="absolute rounded-full" style={{
                  top: -10, right: 10, padding: "4px 9px", background: "var(--text-primary)", color: "var(--bg)",
                  fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", fontWeight: 700, lineHeight: 1,
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.16)",
                }}>
                  {tc.recentTag}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── 창의 부품. 버튼은 글자만큼(알약)이고 둘레 안내 줄과 함께 가운데에 선다(라, 2026-10-01).
  const bigButton = (label: string, onClick: () => void, busy = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="vf-button-primary self-center"
      style={{ fontSize: "1rem", padding: "0.85rem 2.2rem", opacity: busy ? 0.6 : 1 }}
    >
      {label}
    </button>
  );
  // 공개 범위 — 어느 단계에서든 버튼 바로 아래 한 줄(늘 보이는 예외).
  const visibility = (
    <p className="text-center" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", lineHeight: 1.5, margin: "-6px 0 0" }}>
      {tc.visibility}
    </p>
  );
  const smallLink = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="vf-button-text self-center"
      style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", textDecoration: "underline", textUnderlineOffset: 3 }}
    >
      {label}
    </button>
  );
  const errorLine = error && (
    <p role="alert" className="text-center" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.6, margin: 0 }}>
      {error}
    </p>
  );
  // 복사한 뒤 = 큰 버튼 대신 조용한 한 줄. 다음에 할 일을 같이 말하고, 누르면 다시 복사한다
  // (프롬프트 코드는 1회용·30분 — AI가 "다시 복사해 달라"고 하면 이 줄을 누른다).
  const copiedPill = (label: string, onClick: () => void, count: number) => (
    <button
      key={count}
      type="button"
      onClick={onClick}
      disabled={copying}
      title={tc.copyAgain}
      className="vf-soft-fill vf-step-enter self-center rounded-full"
      style={{
        padding: "0.6rem 1.15rem", maxWidth: "100%", textAlign: "center", textWrap: "balance",
        fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.5,
      }}
    >
      <span aria-hidden="true" style={{ marginRight: 6 }}>✓</span>
      {copying ? tc.copying : label}
    </button>
  );
  // 자동 복사가 막혀 직접 복사 칸을 편 경우에도 새 코드로 다시 받을 길을 남긴다(코드는 1회용·30분).
  const promptLead = (label: string) => manualPrompt
    ? <><ManualCopyBox text={manualPrompt} />{smallLink(copying ? tc.copying : tc.copyAgain, copyPromptWithCode)}</>
    : copies > 0 ? copiedPill(label, copyPromptWithCode, copies) : null;
  // 기다림 한 줄 — 초안이 도착하면 ProjectsTab이 이 창을 닫고 확인 화면을 연다(useDraftArrival).
  const waiting = (text: string) => (
    <div className="flex items-center justify-center gap-2.5" role="status">
      <span className="vf-spinner shrink-0" style={{ width: "0.9rem", height: "0.9rem" }} />
      <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.9375rem", lineHeight: 1.6, margin: 0 }}>{text}</p>
    </div>
  );
  const copyLabel = copying ? tc.copying : error ? tc.copyAgain : tc.copyPrompt;
  // 창 안에서 올린 초안 — ✓ 한 줄 + 그 초안의 작은 어두운 카드(제목·소개 세 줄·"초안" 딱지) + [확인하러 가기].
  const arrivedView = arrived && (
    <>
      <div role="status" className="flex items-center justify-center gap-2.5" style={{ marginTop: 4 }}>
        <span aria-hidden="true" className="flex items-center justify-center rounded-full shrink-0" style={{
          width: 26, height: 26, background: "var(--surface-active)", color: "var(--text-primary)",
        }}>
          <StepCheckIcon size={14} />
        </span>
        <p className="vf-serif-display" style={{ fontSize: "1.3125rem", fontWeight: 600, lineHeight: 1.35, margin: 0 }}>{tc.arrivedTitle}</p>
      </div>
      {arrived.title && (
        <DraftMiniCard title={arrived.title} lines={descriptionLines(arrived.description)} style={{ alignSelf: "center", maxWidth: 412 }} />
      )}
      {bigButton(tc.reviewNow, () => openReview(arrived.id))}
      {visibility}
    </>
  );

  const showChooser = !tool || chooserOpen;
  const showPath = path !== null && !showChooser;

  // 큰 버튼 위 3칸 진행 줄(업그레이드) — 이 창의 실제 상태를 그대로 옮긴다. 빨간 테 = 복사 실패(error, 첫 칸)·
  // 붙여넣기 실패(PasteReply의 오류 문구, 가운데 칸). 자동 복사가 막혀 직접 복사 칸을 편 동안은 아직 첫 칸이
  // 내 차례다 — 서버에 AI 흔적이 생기면(useAiStarted) 기다림 칸으로 넘어간다.
  const journey = ((): JourneyStep[] | null => {
    if (!showPath) return null;
    const tj = tc.journey;
    const at = (icon: JourneyIcon, label: string) => (state: JourneyState): JourneyStep => ({ icon, label, state });
    const copy = at("copy", tj.copyPrompt);
    const paste = at("paste", tj.pasteReply);
    const upload = at("upload", tj.aiUploads);
    const card = at("frame", tj.onCard);
    // 창 안에서 올린 초안은 늘 붙여넣기로 왔다 — AI가 직접 올리면 ProjectsTab이 이 창을 닫고 확인 화면을 연다.
    if (arrived) return [copy("done"), paste("done"), card("now")];
    if (path === "claude") {
      const sent = urlStep === "copied" || (urlStep === "manual" && claudeStarted);
      return [at("link", tj.copyUrl)(sent ? "done" : "now"), upload(sent ? "wait" : "todo"), card("todo")];
    }
    if (path === "terminal") {
      if (!prompted) return [copy(error ? "err" : "now"), upload("todo"), card("todo")];
      if (showPaste) return [copy("done"), paste(pasteFailed ? "err" : "now"), card("todo")];
      const sent = !manualPrompt || terminalStarted;
      return [copy(sent ? "done" : "now"), upload(sent ? "wait" : "todo"), card("todo")];
    }
    if (!prompted && !haveReply) return [copy(error ? "err" : "now"), paste("todo"), card("todo")];
    if (pasteFailed) return [copy("done"), paste("err"), card("todo")];
    return manualPrompt ? [copy("now"), paste("todo"), card("todo")] : [copy("done"), paste("now"), card("todo")];
  })();

  return (
    // keep-all: 폰에서 "붙여넣어/요."처럼 한 글자만 다음 줄로 떨어지지 않게 단어 단위로 접는다
    // (.vf-review와 같은 처방). 주소·프롬프트 칸은 각자 줄바꿈 규칙을 따로 쓴다.
    <div className="flex flex-col items-stretch text-left gap-[18px]" style={{ wordBreak: "keep-all", overflowWrap: "break-word" }}>
      {showChooser && (
        <>
          {group(tc.groupAgent, AGENT_TOOLS, "sm:grid-cols-3")}
          {group(tc.groupChat, CHAT_TOOLS, "sm:grid-cols-4")}
        </>
      )}

      {/* 고른 뒤 — 칩 10개 대신 고른 것 한 줄. 지난번 답을 기억해 두었다면 창을 열자마자 이 줄이다. */}
      {tool && !showChooser && (
        <div className="w-full rounded-xl flex items-center justify-between gap-3" style={{ minHeight: 48, padding: "0.5rem 0.5rem 0.5rem 0.85rem", background: "var(--surface-soft)" }}>
          <span className="flex items-center gap-2 min-w-0" style={{ color: "var(--text-primary)" }}>
            <ToolIcon id={tool} />
            <span className="truncate" style={{ fontFamily: "var(--font-nunito)", fontWeight: 600, lineHeight: 1.3, fontSize: "0.9375rem" }}>{toolName(tool)}</span>
          </span>
          <button
            type="button"
            onClick={() => setChooserOpen(true)}
            className="rounded-full shrink-0"
            style={{ padding: "0.45rem 0.9rem", background: "var(--surface)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            {tc.changeTool}
          </button>
        </div>
      )}

      {journey && <JourneyStrip label={tc.journey.label} steps={journey} />}

      {/* 명령을 직접 실행하는 AI — [프롬프트 복사] → 기다림 한 줄. AI가 답만 주고 끝났으면 "답만 받았어요". */}
      {showPath && path === "terminal" && (
        arrived ? arrivedView
          : !prompted ? (
            <>
              {errorLine}
              {bigButton(copyLabel, copyPromptWithCode, copying)}
              {visibility}
            </>
          ) : showPaste ? (
            <PasteReply compact lead={<>{errorLine}{promptLead(tc.copiedTerminal(named))}</>} note={visibility}
              onFailedChange={setPasteFailed} onSuccess={onPasted} />
          ) : (
            <>
              {promptLead(tc.copiedTerminal(named))}
              {waiting(terminalStarted ? tc.startedAi : tc.waitingAi)}
              {visibility}
              {smallLink(tc.replyOnly, () => setShowPaste(true))}
            </>
          )
      )}

      {/* Claude 채팅 — 원격 커넥터(2026-09-17). 커넥터 추가는 Claude 쪽 화면이라 줄일 수 없고, 대신
          처음 한 번뿐이다. 커넥터를 못 쓰는 계정(무료 요금제 한도·회사 계정)은 프롬프트 길로 돌린다. */}
      {showPath && path === "claude" && (
        urlStep === "idle" ? (
          <>
            <p className="text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.9375rem", lineHeight: 1.6, margin: 0 }}>{tc.claudeOnce}</p>
            {bigButton(tc.claudeCopyUrl, () => void copyRemoteUrl())}
            {visibility}
            {smallLink(tc.claudeFallback, () => { setPromptInstead(true); setError(null); })}
          </>
        ) : (
          <>
            {urlStep === "manual" ? (
              <>
                <p className="text-center" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.9375rem", lineHeight: 1.6, margin: 0 }}>{tc.claudeOnce}</p>
                <ManualCopyBox text={remoteMcpUrl(origin)} rows={1} />
              </>
            ) : copiedPill(tc.copiedClaude, () => void copyRemoteUrl(), urlCopies)}
            {waiting(claudeStarted ? tc.startedClaude : tc.waitingClaude)}
            {visibility}
            {smallLink(tc.claudeFallback, () => { setPromptInstead(true); setError(null); })}
          </>
        )
      )}

      {/* 채팅만 하는 AI — 스스로 못 올리니 같은 자리의 버튼이 [프롬프트 복사] → [AI 답 붙여넣기]로 바뀐다. */}
      {showPath && path === "chat" && (
        arrived ? arrivedView
          : !prompted && !haveReply ? (
            <>
              {errorLine}
              {bigButton(copyLabel, copyPromptWithCode, copying)}
              {visibility}
              {smallLink(tc.haveReply, () => { setHaveReply(true); setError(null); })}
            </>
          ) : (
            <PasteReply compact
              lead={<>{errorLine}{prompted ? promptLead(tc.copiedChat(named)) : smallLink(copying ? tc.copying : tc.copyPrompt, copyPromptWithCode)}</>}
              note={visibility} onFailedChange={setPasteFailed} onSuccess={onPasted} />
          )
      )}

      {/* MCP 연결·연결 관리는 설정으로 옮겼다(라, 2026-10-01) — 여기엔 그리로 가는 작은 링크 하나. */}
      <Link
        href="/settings#ai"
        className="self-center"
        style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", textDecoration: "underline", textUnderlineOffset: 3, marginTop: 2 }}
      >
        {tc.settingsLink}
      </Link>
    </div>
  );
}
