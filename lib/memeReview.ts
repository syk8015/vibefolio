// 매일 밈 — 검토 화면(/admin/memes)의 순수 규칙(2026-11-05). 네트워크·DB 없음.
// 라우트(app/api/admin/memes)와 화면, 단위 프로브(scripts/probe-meme-submit-unit.mts)가 함께 쓴다.
//
// 상태는 한 방향으로만 움직인다: 대기 → 공개 | 버림, 공개 → 내림, 버림·내림 → 다시 대기.
// 공개 칸(홈에 뜨는 것)은 오직 'approved'다. 고쳐서 공개하면 edited=true(검사 뒤 글이 바뀌었다는 표시).
import { cleanLine, MEME_TEXT_MAX } from "./memeSubmit";

export type MemeStatus = "pending" | "approved" | "rejected" | "retired";
export type MemeOp = "publish" | "drop" | "retire" | "restore";

// 각 동작이 어느 상태에서 어느 상태로 가는지 — 라우트가 조건부 갱신(.in('status', from))에 그대로 쓴다.
export const MEME_TRANSITIONS: Record<MemeOp, { from: MemeStatus[]; to: MemeStatus }> = {
  publish: { from: ["pending"], to: "approved" },
  drop: { from: ["pending"], to: "rejected" },
  retire: { from: ["approved"], to: "retired" },
  restore: { from: ["rejected", "retired"], to: "pending" },
};

export type MemeReviewParse =
  | { ok: true; id: string; op: MemeOp; edit: { text: string; reply: string | null } | null }
  | { ok: false; field: string; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseMemeReview(body: unknown): MemeReviewParse {
  const fail = (field: string, message: string): MemeReviewParse => ({ ok: false, field, message });
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fail("body", "잘못된 요청이에요.");
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !UUID.test(b.id)) return fail("id", "어떤 줄인지 알 수 없어요.");
  const op = b.op;
  if (op !== "publish" && op !== "drop" && op !== "retire" && op !== "restore") return fail("op", "할 일을 알 수 없어요.");
  // 고친 글은 '공개'에만 붙는다.
  if (b.text === undefined && b.reply === undefined) return { ok: true, id: b.id, op, edit: null };
  if (op !== "publish") return fail("text", "고친 글은 공개할 때만 보낼 수 있어요.");
  const text = cleanLine(b.text, MEME_TEXT_MAX);
  if (text === "bad" || text === null) return fail("text", "첫 줄은 한 줄, 120자 안으로 써 주세요.");
  const reply = b.reply === "" ? null : cleanLine(b.reply, MEME_TEXT_MAX);
  if (reply === "bad") return fail("reply", "답글은 한 줄, 120자 안으로 써 주세요.");
  return { ok: true, id: b.id, op, edit: { text, reply } };
}

// 오늘(한국 날짜) 공개한 수 — 화면 위 "오늘 공개 n/10".
export function kstDay(ms: number) {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}
