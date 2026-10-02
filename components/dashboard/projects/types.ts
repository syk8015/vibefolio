import type { DemoScript } from "@/lib/demoScript";
import type { DemoAccess } from "@/lib/demoAccess";
import type { OwnerInterview } from "@/lib/ownerInterview";
import type { WorkTranslations } from "@/lib/workLanguages";
import type { IntroFilm } from "@/lib/introFilm/schema";
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
// 일시정지(배치 모드) 중 전부 '대기'일 때의 느린 주기 — useDemoStatusSync 참고.
export const DEMO_POLL_PAUSED_MS = 60_000;
// 촬영이 이 시간을 넘기면 배지를 "예상보다 오래 걸려요"로 바꾼다. 실패 판정이
// 아니라 안심 문구 — 유저를 화면 앞에 붙잡아두지 않는 게 목적이다. 운영 경보는
// 별개 임계값(health 크론 STUCK_PENDING_MIN)이라 서로 간섭하지 않는다.
export const DEMO_SLOW_MS = 5 * 60_000;

export const AI_TOOLS_INITIAL = 5;

export interface DBProject {
  id: string;
  // 업로드 시각(DB default now()). 같은 작품을 여러 번 올리면 제목이 똑같아
  // 행에서 구분이 안 된다 — 목록이 날짜+시:분으로 보여준다(2026-09-05).
  created_at: string;
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
  // 영상을 찍은 주소와 지금 demo_url이 다르면 true — 명함이 [체험하기]를 숨긴다(DB 계산 칸,
  // migration_link_verified.sql). 새 주소로 다시 찍으면 저절로 false.
  link_unverified?: boolean | null;
  // 지금 영상을 찍을 때의 촬영 소스(비공개 칸, 트리거가 채움 — 사용자 키로 못 씀).
  demo_filmed_source?: string | null;
  // 링크 순찰(lib/linkPatrol.ts) — 공개 칸 link_state, 나머지는 비공개(순찰만 쓴다).
  link_state?: "moved" | "dead" | "unsafe" | null;
  link_state_detail?: string | null;
  link_checked_url?: string | null;
  link_checked_at?: string | null;
  link_baseline_host?: string | null;
  link_fail_since?: string | null;
  // 사용자 유도형 데모 변형①: 제작자가 쓴 "핵심 기능" 설명. 녹화 워커가 explore
  // 브리핑에 주입한다. 가드 트리거의 파이프라인 컬럼이 아니라 유저가 직접 수정 가능.
  demo_user_hint: string | null;
  // 만든 AI가 써 준 촬영 대본. 발행 게이트가 최소 3스텝을 강제하므로 AI 경로로
  // 들어온 초안엔 사실상 항상 있다(예외=제작자가 시연 영상을 직접 준 경우).
  demo_script: DemoScript | null;
  // 만든 AI가 답한 로그인 질문(url·noLogin·impossible + note). 초안 검토 화면이
  // "로봇이 뭘 보게 되나"를 판정 칩으로 보여주는 근거(2026-09-04).
  demo_access: DemoAccess | null;
  // 만든 AI가 답한 대상 화면(2026-09-15) — 초안 검토 창의 미리보기 틀(폰/PC)을 정한다.
  // 게이트 이전에 올라온 초안은 null(분류로 짐작 — lib/projectTaxonomy previewDevice).
  target_device: "mobile" | "desktop" | null;
  // 재촬영 루프: AI가 다시 써서 제출한 대본이 소유자 확인을 기다리는 자리.
  // 승격(=demo_script 교체)은 [이 대본으로 재촬영]을 눌렀을 때 서버가 한다.
  pending_demo_script: DemoScript | null;
  pending_script_note: string | null;
  pending_script_at: string | null;
  // 작품당 셀프 재촬영 1회 소진 여부(서버 전용 — 가드 트리거가 유저 쓰기를 막는다).
  rerecord_self_used: boolean;
  // 주인 인터뷰(2026-09-29, 필수) — 올리는 AI가 먼저 묻고 받은 주인의 답. 비공개 칸(가릴 것 목록).
  // 인터뷰 게이트 이전 초안·SQL 적용 전엔 null. 모양은 lib/ownerInterview.ts.
  owner_interview: OwnerInterview | null;
  // 주인이 검토 창에서 "내 말이 맞아요"를 누르고 공개한 시각. 비공개 칸.
  owner_interview_confirmed_at: string | null;
  // 작품 두 언어(2026-09-29) — 공개 칸. 기본 언어·앱 화면 언어·다른 언어 판 글(lib/workLanguages.ts).
  // 이 기능 이전 초안·SQL 적용 전엔 null.
  primary_locale: "ko" | "en" | null;
  app_locales: ("ko" | "en")[] | null;
  translations: WorkTranslations | null;
  // 소개 영상(2026-10-02) — 찍을 화면이 없는 작품의 장면 대본(공개 칸). 있으면 촬영 대신 그 자리에서 재생한다.
  intro_film?: IntroFilm | null;
  // 워커가 대본으로 만든 영상 파일 정보(워커 전용 칸).
  intro_render?: { hash?: string; video?: string; poster?: string; at?: string } | null;
}

export type ProjectForm = Omit<
  DBProject,
  | "id"
  | "created_at"
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
  // 촬영 대본은 수정 폼이 다루지 않는다(읽기는 초안 검토 화면에서). 폼에 실리면
  // 저장 때마다 통째로 덮어쓰게 되고, 서버의 대본 게이트와 규칙이 갈린다.
  | "demo_script"
  | "demo_access"
  | "target_device"
  | "pending_demo_script"
  | "pending_script_note"
  | "pending_script_at"
  | "rerecord_self_used"
  // 주인 인터뷰는 초안 검토 창에서만 다룬다(수정 폼에 실리면 저장 때마다 통째로 덮는다).
  | "owner_interview"
  | "owner_interview_confirmed_at"
  // 두 언어 칸도 초안 검토 창에서만 다룬다(같은 이유).
  | "primary_locale"
  | "app_locales"
  | "translations"
  // 소개 영상도 검토 창에서만(서버 검사를 거쳐 저장한다).
  | "intro_film"
  | "intro_render"
>;

