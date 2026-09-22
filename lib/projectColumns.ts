// projects 칸을 "누구나 읽는 칸"과 "주인만 읽는 칸"으로 가른다(2026-09-23, 09-22 감사 ①).
//
// projects RLS는 행 단위(is_draft=false or 주인)라 칸을 못 가린다 — 작품이 공개되면
// 그 행의 모든 칸이 공개 익명 키로 읽혔다(로그인 데모 진입 주소, 로봇 메모, 대본, 촬영
// 에러 원문…). supabase/migration_private_columns.sql이 anon·authenticated의 SELECT를
// PUBLIC 목록으로만 다시 허락한다. PRIVATE 칸은 **주인이라도 사용자 키로는 못 읽는다**
// — 서버가 주인 확인 뒤 관리자 권한으로 읽는다(/api/projects/private, 각 라우트).
// 쓰기(UPDATE) 권한은 그대로라 주인의 대시보드 수정은 사용자 키로 계속 된다.
//
// 🔴 projects에 칸을 새로 만들 때: 공개해도 되는 칸이면 PUBLIC에 넣고 SQL에도 GRANT를
// 추가, 아니면 PRIVATE에 넣는다. `npm test`의 probe-project-columns가 이 파일과 SQL의
// GRANT 목록이 어긋나면 막는다. 사용자 키로 projects를 `select("*")`/`select()` 하면
// SQL 적용 뒤 permission denied로 깨지므로 그것도 같은 검사가 막는다.
export const PUBLIC_PROJECT_COLUMNS = [
  "id",
  "user_id",
  "title",
  "description",
  "type",
  "thumbnail",
  "year",
  "tags",
  "demo_url",
  "comment",
  "sort_order",
  "created_at",
  "content_type",
  "is_featured",
  "video_url",
  "demo_source_type",
  "demo_build_status",
  "demo_video_url",
  "demo_generated_at",
  "demo_attempt_count",
  "demo_status_changed_at",
  "is_draft",
  "pending_script_at",
  "rerecord_self_used",
  "target_device",
] as const;

export const PRIVATE_PROJECT_COLUMNS = [
  "demo_access",
  "demo_user_hint",
  "demo_script",
  "pending_demo_script",
  "pending_script_note",
  "demo_build_error",
  "demo_source_value",
] as const;

export type PrivateProjectColumn = (typeof PRIVATE_PROJECT_COLUMNS)[number];

/** 사용자 키(익명·로그인)로 projects를 읽을 때 쓰는 select 목록. */
export const PUBLIC_PROJECT_SELECT = PUBLIC_PROJECT_COLUMNS.join(", ");

/** 주인 전용 칸 select 목록(관리자 권한 클라이언트 전용). id 포함. */
export const PRIVATE_PROJECT_SELECT = ["id", ...PRIVATE_PROJECT_COLUMNS].join(", ");
