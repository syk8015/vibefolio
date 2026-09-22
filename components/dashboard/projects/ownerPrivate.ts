import { PRIVATE_PROJECT_COLUMNS, type PrivateProjectColumn } from "@/lib/projectColumns";
import type { DBProject } from "./types";

// 주인 전용 칸(대본·로그인 답·로봇 메모·촬영 에러 원문·촬영 소스)을 대시보드 행에
// 합치는 도구(2026-09-23, 09-22 감사 ①).
//
// 이 칸들은 사용자 키로 SELECT가 막혀(supabase/migration_private_columns.sql) 주인이라도
// 브라우저에서 직접 못 읽는다 — /api/projects/private가 주인 확인 뒤 내려준다. 사용자
// 키로 읽은 행(목록·update().select()·realtime 페이로드)엔 공개 칸만 확실하고, 비공개
// 칸은 SQL 적용 전이면 실려 오고 뒤면 빠져 온다. 코드는 둘 다에서 돌아야 한다.
//
// 규칙 하나: 사용자 키로 읽은 행은 **기존 행 위에 얹는다**. 통째로 갈아 끼우면 비공개
// 칸이 빈 행이 화면에 남아 대본·로봇 메모가 사라지고, 그 빈 값으로 수정 저장을 하면
// DB의 값까지 지운다.

/** 사용자 키로 읽은 projects 행 — 비공개 칸은 있을 수도(SQL 전) 없을 수도(SQL 뒤). */
export type UserKeyRow = Omit<DBProject, PrivateProjectColumn> &
  Partial<Pick<DBProject, PrivateProjectColumn>>;

export type OwnerPrivate = Pick<DBProject, "id" | PrivateProjectColumn>;

const EMPTY_PRIVATE: Pick<DBProject, PrivateProjectColumn> = {
  demo_access: null,
  demo_user_hint: null,
  demo_script: null,
  pending_demo_script: null,
  pending_script_note: null,
  demo_build_error: null,
  demo_source_value: null,
};

// 라우트의 ?ids= 상한(app/api/projects/private MAX_IDS). 넘으면 ids 없이 전부 받는다.
const MAX_IDS = 200;

/** 행·페이로드에 비공개 칸이 전부 실려 왔나 — 실려 왔으면 서버에 다시 물을 필요가 없다. */
export function hasPrivate(row: object): boolean {
  return PRIVATE_PROJECT_COLUMNS.every((c) => c in row);
}

/**
 * 사용자 키로 읽은 행(부분 행 포함)을 기존 행 위에 얹는다. 값이 undefined인 칸은
 * 건너뛴다 — 빠져 온 비공개 칸이 있던 값을 지우지 않게. 기존 행이 없으면 비공개 칸은
 * null로 시작한다(서버 값을 받으면 applyPrivate가 채운다).
 */
export function mergeRow(prev: DBProject | undefined, incoming: Partial<DBProject>): DBProject {
  const out: Record<string, unknown> = { ...EMPTY_PRIVATE, ...prev };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== undefined) out[k] = v;
  }
  return out as unknown as DBProject;
}

/** 받아 온 비공개 칸을 목록에 얹는다. 바뀐 행이 없으면 같은 배열을 돌려준다(재렌더 방지). */
export function applyPrivate(rows: DBProject[], priv: Map<string, OwnerPrivate>): DBProject[] {
  let changed = false;
  const next = rows.map((p) => {
    const v = priv.get(p.id);
    if (!v) return p;
    changed = true;
    return { ...p, ...v };
  });
  return changed ? next : rows;
}

/**
 * 공개 칸만 실려 온 갱신이 비공개 칸도 바꿨을 수 있나 — 서버에 다시 물을지 가른다.
 * 촬영 상태 전이(에러 원문·촬영 소스·대본 승격이 같이 바뀐다), 새 대본 제출
 * (pending_script_at), 초안(AI가 대본·로그인 답을 고쳐 보낸다)일 때만 묻는다. 정렬·대표
 * 지정 같은 잦은 갱신마다 부르면 순서 한 번 바꿀 때 행 수만큼 요청이 나간다.
 */
// 초안이라도 이 칸들만 바뀐 갱신은 비공개 칸과 무관하다(대표 지정·순서 바꾸기).
const ORDER_ONLY = new Set<string>(["is_featured", "sort_order"]);

// 값으로 비교한다 — realtime은 배열·객체 칸(tags 등)을 매번 새 객체로 보내 !==면 늘 "바뀜"이다.
const sameValue = (a: unknown, b: unknown) =>
  a === b || (typeof a === "object" && typeof b === "object" && JSON.stringify(a) === JSON.stringify(b));

export function mayTouchPrivate(prev: DBProject, next: Partial<DBProject>): boolean {
  if (hasPrivate(next)) return false;
  const changed = (k: keyof DBProject) => k in next && !sameValue(next[k], prev[k]);
  if (prev.is_draft || next.is_draft === true) {
    // 초안은 AI가 대본·로그인 답·로봇 메모(비공개 칸)**만** 고쳐 보내기도 한다 — 그러면 공개
    // 칸은 하나도 안 바뀐 UPDATE가 온다. 그래서 기본은 "묻는다"이고, 바뀐 공개 칸이 정렬·대표
    // 지정뿐일 때만 건너뛴다.
    const keys = (Object.keys(next) as (keyof DBProject)[]).filter(changed);
    return !(keys.length > 0 && keys.every((k) => ORDER_ONLY.has(k)));
  }
  return changed("demo_build_status") || changed("demo_status_changed_at") || changed("pending_script_at");
}

/**
 * GET /api/projects/private — 로그인한 주인의 작품들의 비공개 칸. ids를 주면 그 행만.
 * 실패하면 null — 호출부는 화면에 있던 값을 그대로 두고 목록은 막지 않는다.
 */
export async function fetchOwnerPrivate(ids?: string[]): Promise<Map<string, OwnerPrivate> | null> {
  if (ids && ids.length === 0) return new Map();
  const qs = ids && ids.length <= MAX_IDS ? `?ids=${encodeURIComponent(ids.join(","))}` : "";
  try {
    // 서버가 멎어도 대시보드가 기다리며 묶이지 않게 8초에서 끊는다(끊기면 null = 화면 값 유지).
    const res = await fetch(`/api/projects/private${qs}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    if (!Array.isArray(body?.rows)) return null;
    return new Map((body.rows as OwnerPrivate[]).map((r) => [r.id, r]));
  } catch {
    return null;
  }
}
