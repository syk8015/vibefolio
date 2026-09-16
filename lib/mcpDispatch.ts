import { logger } from "@/lib/logger";

// 원격 MCP의 툴 실행기(2026-09-17). app/api/mcp가 JSON-RPC 껍데기를 벗기면 여기가
// 실제 일을 시킨다.
//
// **왜 우리 API를 HTTP로 다시 부르는가**(라우트 핸들러를 직접 import하지 않고):
// 발행의 판정 — 대본 최소 스텝·로그인 질문·소개글 3줄 모양·targetDevice·URL 게이트·
// 레이트리밋·업로드 안전 — 은 전부 app/api/ingest/route.ts의 한 흐름 안에 있다.
// 그걸 끌어다 쓰려고 쪼개면 게이트가 두 벌이 되고, 그 순간 "검사에선 통과라더니
// 발행에선 거절"이 시작된다(설명서를 한 장에서 생성하기로 한 것과 같은 판단).
// 그래서 원격 MCP는 **얇은 통역사**로만 남는다: 받은 Bearer 토큰을 그대로 실어
// 우리 자신의 API를 부르고, 답을 사람이 읽는 문장으로 옮긴다. 게이트는 한 벌이다.
//
// 권한도 이 구조가 지켜 준다 — 토큰 주인이 곧 호출자이고, 여기서 격상되는 것은 없다.

/** 툴 하나의 실행 결과. isError=true면 MCP가 "실패"로 표시하고 AI가 고쳐 다시 시도한다. */
export type ToolResult = { text: string; isError: boolean };

/** 발행은 셀렉터 확인(6초)까지 하므로 넉넉히, 나머지는 짧게. */
const TIMEOUT_MS = 30_000;

type Json = Record<string, unknown>;

async function forward(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  bearer: string,
  body?: Json,
): Promise<{ status: number; body: Json }> {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${bearer}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // 우리 자신의 주소라 리다이렉트가 있을 이유가 없다 — 있으면 무언가 잘못된 것이다.
    redirect: "error",
  });
  let parsed: Json = {};
  try {
    parsed = (await res.json()) as Json;
  } catch {
    parsed = {};
  }
  return { status: res.status, body: parsed };
}

/**
 * 실패 응답 → AI가 읽을 문장. 우리 API의 에러 본문은 그 자체가 지시문으로 설계돼
 * 있다("대본이 4스텝 미만이다" 같은) — 그러니 갈아치우지 말고 그대로 전한다.
 */
function failure(r: { status: number; body: Json }): ToolResult {
  const code = (r.body.code as string) ?? `HTTP ${r.status}`;
  const message = (r.body.error as string) ?? "the server sent no message";
  return { isError: true, text: `Rejected (${code}): ${message}` };
}

/** 저장 직전 값 요약(accepted). 사람이 아니라 AI가 읽는 물건이라 JSON 그대로가 낫다. */
function echo(body: Json): string {
  return body.accepted ? `\naccepted: ${JSON.stringify(body.accepted)}` : "";
}

function needId(args: Json): string | null {
  const id = args.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * 툴 하나 실행. `origin`은 요청이 들어온 주소를 그대로 쓴다 — 프리뷰 배포에서
 * 프로덕션을 부르지 않게(APP_ORIGIN 고정값을 쓰면 그렇게 된다).
 */
export async function callTool(
  name: string,
  rawArgs: Json,
  bearer: string,
  origin: string,
): Promise<ToolResult> {
  // 로컬 경로 필드는 원격 스키마에 아예 없지만(생성기가 뺀다), 옛 클라이언트가
  // 실어 보낼 수 있으니 여기서도 버린다 — 우리 서버엔 그 경로에 파일이 없다.
  const args: Json = { ...rawArgs };
  for (const localOnly of ["dir", "screenshot", "video"]) delete args[localOnly];

  try {
    switch (name) {
      case "publish_to_nookframe": {
        const r = await forward("POST", `${origin}/api/ingest`, bearer, args);
        if (r.status !== 200 || !r.body.ok) return failure(r);
        const id = r.body.projectId as string;
        const verb = args.draftId ? "Updated the draft" : r.body.upserted ? "Updated the existing draft" : "Uploaded as a draft";
        return {
          isError: false,
          text:
            `${verb} on Nookframe (draft id: ${id} — pass it as draftId to update this draft). ` +
            `Nothing is public yet: the owner reviews it and presses publish at ${r.body.reviewUrl}.${echo(r.body)}`,
        };
      }

      case "check_nookframe_payload": {
        const r = await forward("POST", `${origin}/api/ingest?dryRun=1`, bearer, args);
        if (r.status !== 200 || !r.body.ok) {
          const f = failure(r);
          return { isError: true, text: `${f.text}\nNothing was uploaded — fix the payload and check again.` };
        }
        if (!r.body.dryRun) {
          // 드라이런을 모르는 서버라면 방금 진짜로 올라간 것이다 — 반드시 알린다.
          return {
            isError: true,
            text: `This Nookframe server does not support checking yet, so the payload was PUBLISHED as a draft (id ${r.body.projectId ?? "unknown"}). Tell the owner, or remove it with delete_nookframe_draft.`,
          };
        }
        const wouldUpdate = r.body.wouldUpdate ? `It would UPDATE the existing draft ${r.body.draftId}.` : "It would create a NEW draft.";
        return { isError: false, text: `This payload would be ACCEPTED. ${wouldUpdate}${echo(r.body)}` };
      }

      case "list_nookframe_drafts": {
        const r = await forward("GET", `${origin}/api/ingest/drafts`, bearer);
        if (r.status !== 200 || !r.body.ok) return failure(r);
        const drafts = (r.body.drafts ?? []) as Json[];
        if (!drafts.length) return { isError: false, text: "No drafts." };
        const lines = drafts.map((d) =>
          `- ${d.id} · ${d.title}${d.demo_url ? ` · ${d.demo_url}` : ""}` +
          ` · [${Array.isArray(d.tags) && d.tags.length ? (d.tags as string[]).join(", ") : "no AI tools"}` +
          ` / ${d.content_type || "no type"} / ${d.target_device || "screen not answered"}]`,
        );
        return { isError: false, text: `${drafts.length} draft(s):\n${lines.join("\n")}` };
      }

      case "update_nookframe_draft": {
        const id = needId(args);
        if (!id) return { isError: true, text: "id is required (find it with list_nookframe_drafts)." };
        const patch: Json = { ...args };
        delete patch.id;
        const r = await forward("PATCH", `${origin}/api/ingest/drafts/${encodeURIComponent(id)}`, bearer, patch);
        if (r.status !== 200 || !r.body.ok) return failure(r);
        return { isError: false, text: `Draft updated. Review: ${r.body.reviewUrl}${echo(r.body)}` };
      }

      case "delete_nookframe_draft": {
        const id = needId(args);
        if (!id) return { isError: true, text: "id is required (find it with list_nookframe_drafts)." };
        const r = await forward("DELETE", `${origin}/api/ingest/drafts/${encodeURIComponent(id)}`, bearer);
        if (r.status !== 200 || !r.body.ok) return failure(r);
        return { isError: false, text: "Draft deleted (uploaded files included)." };
      }

      case "rerecord_nookframe_demo": {
        const id = needId(args);
        if (!id) return { isError: true, text: "id is required (it is written in the re-record prompt the owner gave you)." };
        const payload: Json = { ...args };
        delete payload.id;
        const r = await forward("POST", `${origin}/api/ingest/rerecord/${encodeURIComponent(id)}`, bearer, payload);
        if (r.status !== 200 || !r.body.ok) return failure(r);
        return {
          isError: false,
          text:
            "The new script is stored as PENDING — the video has NOT changed yet. " +
            "Tell the owner they must open the dashboard and press [Re-record] for filming to start." +
            echo(r.body),
        };
      }

      default:
        return { isError: true, text: `Unknown tool: ${name}` };
    }
  } catch (err) {
    logger.error("mcp: tool call failed", { error: err, tool: name });
    const why = err instanceof Error && err.name === "TimeoutError" ? "the request timed out" : "the request failed";
    return { isError: true, text: `Could not reach Nookframe: ${why}. Try again in a moment.` };
  }
}
