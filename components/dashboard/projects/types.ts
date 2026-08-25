// Shared types + constants for the dashboard Projects tab. Extracted verbatim from
// ProjectsTab.tsx (no behavior change) so the row components, hooks, and form modal
// can share one definition instead of re-declaring it.

export type DemoBuildStatus =
  | "pending"
  | "building"
  | "recording"
  | "editing"
  | "done"
  | "failed"
  | "held";

// 촬영이 아직 진행 중인 상태들. 이 행이 하나라도 있는 동안만 폴백 폴링이 돌고,
// 전부 done/failed/held로 떨어지면 스스로 멈춘다.
export const DEMO_IN_FLIGHT: ReadonlySet<DemoBuildStatus> = new Set([
  "pending",
  "building",
  "recording",
  "editing",
]);
export const DEMO_POLL_MS = 10_000;
// 촬영이 이 시간을 넘기면 배지를 "예상보다 오래 걸려요"로 바꾼다. 실패 판정이
// 아니라 안심 문구 — 유저를 화면 앞에 붙잡아두지 않는 게 목적이다. 운영 경보는
// 별개 임계값(health 크론 STUCK_PENDING_MIN)이라 서로 간섭하지 않는다.
export const DEMO_SLOW_MS = 5 * 60_000;

export const AI_TOOLS_INITIAL = 5;

export interface DBProject {
  id: string;
  title: string;
  description: string;
  type: "image" | "video";
  content_type: string | null;
  thumbnail: string;
  year: string;
  tags: string[];
  demo_url: string;
  comment: string;
  sort_order: number;
  is_featured: boolean;
  is_draft: boolean;
  video_url: string;
  demo_source_type: "github" | "live_url" | "zip" | null;
  demo_source_value: string | null;
  demo_build_status: DemoBuildStatus | null;
  demo_build_error: string | null;
  demo_video_url: string | null;
  demo_generated_at: string | null;
  // DB 트리거가 모든 상태 전이마다 찍는다 (migration_stuck_watchdog.sql).
  demo_status_changed_at: string | null;
  // 사용자 유도형 데모 변형①: 제작자가 쓴 "핵심 기능" 설명. 녹화 워커가 explore
  // 브리핑에 주입한다. 가드 트리거의 파이프라인 컬럼이 아니라 유저가 직접 수정 가능.
  demo_user_hint: string | null;
}

export type ProjectForm = Omit<
  DBProject,
  | "id"
  | "sort_order"
  | "is_featured"
  | "is_draft"
  | "demo_source_type"
  | "demo_source_value"
  | "demo_build_status"
  | "demo_build_error"
  | "demo_video_url"
  | "demo_generated_at"
  | "demo_status_changed_at"
>;

