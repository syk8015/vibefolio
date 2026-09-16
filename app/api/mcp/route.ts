import { NextRequest, NextResponse } from "next/server";
import { verifyToken, bearerFromHeader } from "@/lib/apiToken";
import { MCP_TOOLS, MCP_TOOL_NAMES } from "@/lib/mcpTools";
import { callTool } from "@/lib/mcpDispatch";
import { OAUTH_SCOPE } from "@/lib/oauth";
import { logger } from "@/lib/logger";

// POST /api/mcp — 원격 MCP 서버(Streamable HTTP). 셸 없는 채팅창 AI가 우리 서버를
// **직접** 부르는 통로다(2026-09-17). 셸이 있는 AI는 `npx nookframe mcp`(stdio)를
// 쓰고, 두 쪽 모두 같은 원본에서 생성된 툴 정의를 본다(lib/mcpTools.ts).
//
// ── 왜 코드가 두 겹인가 ─────────────────────────────────────────────────────
// MCP 규격이 2026-07-28에 갈아엎였다: 연결 인사(`initialize`)와 세션과 `ping`이
// 사라지고 `server/discover`가 그 자리에 왔다. 그런데 Claude는 그 전환 한가운데라
// 표면에 따라 **옛 방식으로 말을 거는 경우가 있다**(2026-08 실측 보고). 한쪽만
// 구현하면 "연결 실패"만 뜨고 이유는 화면에 안 나온다. 그래서 한 주소에서 두 시대를
// 다 받는다 — 본문에 무엇이 들어 있는지로 갈라 읽는다.
//
// ── 인증은 JSON-RPC보다 먼저 ────────────────────────────────────────────────
// 토큰이 없으면 **진짜 401**을 준다. 200 안에 오류를 담으면 클라이언트는 로그인
// 화면을 띄우지 않고 AI가 오류 문장만 읽는다. 그리고 여기서는 **쿠키를 절대 안 본다** —
// ingestAuth는 쿠키 세션을 폴백으로 받지만, 그걸 이 주소에 붙이면 남의 사이트가
// 로그인한 사람의 브라우저로 툴을 호출시킬 수 있다(CSRF). Bearer 전용이 그 문을 닫는다.

const SERVER_INFO = { name: "nookframe", version: "1.0.0" };

/** 우리가 알아듣는 규격 판. 첫 번째가 최신이자 기본값이다. */
const SUPPORTED = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"];

/** 목록 결과의 캐시 힌트(신규격 필수). 툴 정의는 배포 때만 바뀐다. */
const LIST_TTL_MS = 300_000;

const INSTRUCTIONS =
  "Nookframe is a portfolio for vibe-coded work. Uploading always creates a DRAFT: " +
  "nothing becomes public until the owner reviews it in their dashboard and presses publish. " +
  "Call check_nookframe_payload first when unsure — it runs every gate without storing anything.";

type Json = Record<string, unknown>;

// ── 응답 헬퍼 ────────────────────────────────────────────────────────────────

function rpcResult(id: unknown, result: Json, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { status });
}

function rpcError(id: unknown, code: number, message: string, status: number, data?: Json) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } },
    { status },
  );
}

/**
 * 401 — 이 응답의 WWW-Authenticate가 발견의 출발점이다. 클라이언트는 여기 적힌
 * resource_metadata를 읽고 어느 인증 서버로 로그인하러 갈지 알아낸다. 빼먹으면
 * 사람은 "인증 실패"만 보고 로그인 화면을 못 만난다.
 */
function unauthorized(origin: string, description: string) {
  const prm = `${origin}/.well-known/oauth-protected-resource/api/mcp`;
  return NextResponse.json(
    { error: "invalid_token", error_description: description },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer error="invalid_token", error_description="${description}", resource_metadata="${prm}", scope="${OAUTH_SCOPE}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}

/** 신규격 서버는 GET·DELETE를 받지 않는다(세션이 없어졌다). 옛 규격도 405를 허용한다. */
function methodNotAllowed() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export function GET() {
  return methodNotAllowed();
}
export function DELETE() {
  return methodNotAllowed();
}

// ── 헤더 대조(신규격) ────────────────────────────────────────────────────────
//
// 신규격은 본문의 값 일부를 헤더에도 싣게 하고, **어긋나면 거절하라**고 한다
// (중간 장비가 본문을 안 열고도 라우팅·감사할 수 있게 하려는 설계). 값이 ASCII가
// 아니면 `=?base64?…?=` 봉투에 담겨 오므로 비교 전에 풀어야 한다.
function decodeHeader(value: string | null): string | null {
  if (!value) return null;
  const m = /^=\?base64\?(.*)\?=$/.exec(value.trim());
  if (!m) return value.trim();
  try {
    return Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return value.trim();
  }
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  try {
    // 1. 인증 — JSON-RPC를 읽기도 전에. Bearer 전용(쿠키 폴백 없음).
    const bearer = bearerFromHeader(req.headers.get("authorization"));
    if (!bearer) return unauthorized(origin, "An access token is required.");
    const tok = await verifyToken(bearer);
    if (!tok) return unauthorized(origin, "This access token is invalid or expired.");

    // 2. 본문 — 단일 JSON-RPC 메시지. 배열로 보내는 클라이언트가 있어 한 개짜리는 받아준다.
    let body: Json;
    try {
      const parsed = (await req.json()) as unknown;
      const one = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!one || typeof one !== "object") throw new Error("not an object");
      body = one as Json;
    } catch {
      return rpcError(null, -32700, "Parse error: the body must be a single JSON-RPC message.", 400);
    }

    const id = body.id ?? null;
    const method = typeof body.method === "string" ? body.method : "";
    const params = (body.params ?? {}) as Json;
    const meta = (params._meta ?? {}) as Json;
    const bodyVersion = meta["io.modelcontextprotocol/protocolVersion"];
    // 신규격인가 = 본문이 스스로 판을 밝혔는가. 옛 규격엔 이 자리가 없다.
    const modern = typeof bodyVersion === "string";

    // 3. 알림(id 없음)은 답이 없다 — 받았다는 뜻으로 202만 준다.
    const isNotification = body.id === undefined || body.id === null;

    if (modern) {
      const headerVersion = decodeHeader(req.headers.get("mcp-protocol-version"));
      // 헤더와 본문이 다르면 거절(-32020). 같은 값을 두 군데 싣게 한 규칙의 요점이다.
      if (headerVersion && headerVersion !== bodyVersion) {
        return rpcError(id, -32020, `Header mismatch: MCP-Protocol-Version header value '${headerVersion}' does not match body value '${bodyVersion}'`, 400);
      }
      if (!SUPPORTED.includes(bodyVersion as string)) {
        return rpcError(id, -32022, "Unsupported protocol version", 400, { supported: SUPPORTED, requested: bodyVersion });
      }
      const headerMethod = decodeHeader(req.headers.get("mcp-method"));
      if (headerMethod && headerMethod !== method) {
        return rpcError(id, -32020, `Header mismatch: Mcp-Method header value '${headerMethod}' does not match body value '${method}'`, 400);
      }
      if (method === "tools/call") {
        const headerName = decodeHeader(req.headers.get("mcp-name"));
        const bodyName = typeof params.name === "string" ? params.name : "";
        if (headerName && headerName !== bodyName) {
          return rpcError(id, -32020, `Header mismatch: Mcp-Name header value '${headerName}' does not match body value '${bodyName}'`, 400);
        }
      }
    }

    // 4. 메서드 — 두 시대가 겹치는 것(tools/*)은 한 번만 쓰고 모양만 갈라 낸다.
    switch (method) {
      // ── 신규격: 연결 인사 대신 발견 한 번 ──
      case "server/discover":
        return rpcResult(id, {
          resultType: "complete",
          supportedVersions: SUPPORTED,
          capabilities: { tools: {} },
          instructions: INSTRUCTIONS,
          ttlMs: LIST_TTL_MS,
          cacheScope: "public",
          _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
        });

      // ── 옛 규격: 연결 인사. 세션 id는 절대 만들지 않는다(우리는 무상태다) ──
      case "initialize": {
        const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
        // 상대가 아는 판이면 그대로 되돌려주고, 모르면 우리 최신을 제시한다.
        const agreed = SUPPORTED.includes(asked) ? asked : SUPPORTED[0];
        return rpcResult(id, {
          protocolVersion: agreed,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
      }

      case "notifications/initialized":
        return new NextResponse(null, { status: 202 });

      // ── 옛 규격에만 있는 생존 확인 ──
      case "ping":
        return isNotification ? new NextResponse(null, { status: 202 }) : rpcResult(id, {});

      case "tools/list":
        return rpcResult(id, {
          tools: MCP_TOOLS,
          ...(modern ? { resultType: "complete", ttlMs: LIST_TTL_MS, cacheScope: "public" } : {}),
        });

      case "tools/call": {
        const name = typeof params.name === "string" ? params.name : "";
        if (!MCP_TOOL_NAMES.includes(name)) {
          return rpcError(id, -32602, `Unknown tool: ${name}`, 200);
        }
        const args = (params.arguments ?? {}) as Json;
        const out = await callTool(name, args, bearer, origin);
        // 툴이 실패한 것은 **프로토콜 오류가 아니다** — 200에 isError로 싣는다.
        // 그래야 AI가 이유를 읽고 고쳐서 다시 부른다(우리 게이트 설계의 요점).
        return rpcResult(id, {
          ...(modern ? { resultType: "complete" } : {}),
          content: [{ type: "text", text: out.text }],
          isError: out.isError,
        });
      }

      default:
        // 모르는 메서드는 404 — 신규격이 그렇게 정했고, 옛 규격 클라이언트도 -32601을 읽는다.
        return rpcError(id, -32601, `Method not found: ${method}`, 404);
    }
  } catch (err) {
    logger.error("mcp: unhandled", { error: err });
    return rpcError(null, -32603, "Internal error", 500);
  }
}
