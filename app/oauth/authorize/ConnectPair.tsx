import { AI_TOOL_PATHS } from "@/components/dashboard/aiToolPaths";
import BrandMark from "@/components/BrandMark";

// 연결 허락 화면 맨 위의 짝 그림(10-01 업그레이드): [요청한 쪽] ··🔒·· [Nookframe].
//
// ⚠️ 왼쪽 그림은 **검증된 client_id 호스트**로만 고른다. 스스로 밝힌 이름(client_name)은
// 누구나 "Claude"라고 적을 수 있어서, 이름을 보고 Claude 그림을 붙이면 사칭에 우리 화면이
// 도장을 찍어 주는 꼴이 된다. 호스트가 정확히 claude.ai일 때만 Claude 그림, 나머지는 모두
// 중립 그림이다. 오류일 땐 누가 불렀는지 모르니 중립 그림 + 끊긴 선(✕).
// 이 그림은 장식이다 — 주소·경고·오류는 아래 글이 그대로 말하므로 스크린리더에서는 숨긴다.

// Claude 공식 색(simple-icons) — 연결 창·설정 AI 연결과 같은 값.
const CLAUDE_ORANGE = "#D97757";
const CLAUDE_HOST = "claude.ai";

const CIRCLE: React.CSSProperties = {
  width: 54, height: 54, borderRadius: "50%", flex: "0 0 auto",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

type Props =
  | { broken: true }
  | { broken?: false; verifiedHost: string; local: boolean; localLabel: string };

export default function ConnectPair(props: Props) {
  const isClaude = !props.broken && props.verifiedHost === CLAUDE_HOST;
  const local = !props.broken && props.local;
  return (
    <div aria-hidden className="flex items-center justify-center"
      style={{ gap: 10, margin: `4px 0 ${local ? 30 : 22}px` }}>
      <span className="relative inline-flex">
        {isClaude ? <ClaudeCircle /> : <NeutralCircle />}
        {local && <LocalBadge label={props.localLabel} />}
      </span>
      {props.broken ? <BrokenLink /> : <LockedLink />}
      <span style={{ ...CIRCLE, background: "var(--text-primary)", color: "var(--bg)", boxShadow: "0 6px 16px rgba(0,0,0,0.16)" }}>
        <BrandMark size="1.25rem" />
      </span>
    </div>
  );
}

function ClaudeCircle() {
  return (
    <span style={{ ...CIRCLE, background: "var(--surface)", boxShadow: "0 0 0 1px var(--border), var(--shadow-panel)" }}>
      <svg width="26" height="26" viewBox="0 0 24 24">
        <path d={AI_TOOL_PATHS.claude} fill={CLAUDE_ORANGE} />
      </svg>
    </span>
  );
}

// 어떤 프로그램인지 그림으로는 말하지 않는다 — 창 하나(앱) 모양.
function NeutralCircle() {
  return (
    <span style={{ ...CIRCLE, background: "var(--surface-soft)", boxShadow: "inset 0 0 0 1.5px var(--border-bright)", color: "var(--text-muted)" }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3.5" y="5" width="17" height="14" rx="3" />
        <path d="M3.5 9.5h17" />
      </svg>
    </span>
  );
}

const DOTS = (width: number): React.CSSProperties => ({ width, borderTop: "2px dotted var(--border-bright)" });

function LockedLink() {
  return (
    <span className="relative flex items-center">
      <span style={DOTS(98)} />
      <span className="absolute flex items-center justify-center"
        style={{
          left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 28, height: 28, borderRadius: "50%",
          background: "var(--surface)", boxShadow: "0 0 0 1px var(--border-bright)", color: "var(--text-secondary)",
        }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
    </span>
  );
}

function BrokenLink() {
  return (
    <span className="flex items-center">
      <span style={DOTS(30)} />
      <span className="flex items-center justify-center"
        style={{
          width: 24, height: 24, margin: "0 7px", borderRadius: "50%",
          background: "color-mix(in srgb, var(--danger) 14%, var(--surface))", color: "var(--danger)",
        }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
      <span style={DOTS(30)} />
    </span>
  );
}

// 돌아갈 곳이 이 컴퓨터(루프백)일 때 요청한 쪽 동그라미 밑에 붙는 작은 표시.
function LocalBadge({ label }: { label: string }) {
  return (
    <span className="absolute inline-flex items-center"
      style={{
        left: "50%", bottom: -12, transform: "translateX(-50%)", whiteSpace: "nowrap", gap: 4,
        background: "var(--text-primary)", color: "var(--bg)", boxShadow: "0 0 0 2px var(--surface)",
        fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1, borderRadius: 999, padding: "4px 9px",
      }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <rect x="4.5" y="5" width="15" height="10.5" rx="1.5" />
        <path d="M2.5 19h19" />
      </svg>
      {label}
    </span>
  );
}
