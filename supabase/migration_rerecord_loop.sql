-- Nookframe — 재촬영 루프 (사람은 말로, 대본은 AI가 다시 쓴다). 2026-08-25
--
-- 배경: 수동 업로드를 폐기하고 대본 게이트를 세우면서 촬영 대본이 자동 시연
-- 품질의 유일한 손잡이가 됐다. 그런데 영상이 마음에 안 들 때 고칠 방법이 없었다 —
-- 공개된 작품은 PAT 경로가 손댈 수 없고(초안 전용), 사람이 CSS 셀렉터를 손으로
-- 고치게 하는 건 제품 방향(업로드=AI 전용)과 어긋난다.
--
-- 사용자 확정 설계(2026-08-25): 사람은 영상을 보고 **말로** 불만을 적고
-- ("16초에서 그거 클릭하지 마", "이 기능이 빠졌어"), 사이트가 그 불만 + 원본 대본
-- + 작품 정보 전부를 담은 재촬영 프롬프트를 만들어 준다. 재촬영은 새 세션의 AI가
-- 맡을 수 있으므로 프롬프트 하나로 맥락이 완결돼야 한다. AI가 쓴 새 대본은 곧장
-- 반영되지 않고 pending_demo_script에 **대기**하다가, 소유자가 대시보드에서 확인한
-- 뒤에야 촬영 큐로 간다(촬영은 편당 비용이 든다 — 사람 눈이 마지막 게이트).
--
-- 승인 정책(사용자 확정): 작품당 재촬영 **1회는 소유자가 바로**, 그 다음부터는
-- 관리자 승인(demo_requests kind='rerecord'). rerecord_self_used가 그 1회 소진 여부.
--
-- 컬럼 성격: pending_demo_script/pending_script_note는 demo_script·demo_user_hint와
-- 같은 유저 CONTENT 컬럼이라 guard_demo_columns()에 **넣지 않는다**(파이프라인 컬럼
-- =demo_build_status·demo_video_url 등만 서버 전용). rerecord_self_used는 소비 카운터라
-- 소유자가 스스로 되돌리면 안 되므로 가드에 추가한다.

alter table projects add column if not exists pending_demo_script jsonb;
alter table projects add column if not exists pending_script_at timestamptz;
alter table projects add column if not exists pending_script_note text;
alter table projects add column if not exists rerecord_self_used boolean not null default false;

-- demo_script와 동일한 shape 규칙(object · ≤16KB). 정규화 상한을 전부 한글로 채워도
-- ~14KB라 여유 있게 덮는다.
alter table projects drop constraint if exists projects_pending_demo_script_shape;
alter table projects add constraint projects_pending_demo_script_shape
  check (
    pending_demo_script is null
    or (jsonb_typeof(pending_demo_script) = 'object' and pg_column_size(pending_demo_script) <= 16384)
  );

-- AI가 새 대본을 제출하며 남기는 "무엇을 왜 바꿨는지" 한 줄. 소유자가 대시보드에서
-- 새 대본을 검토할 때 읽는다(사람이 쓴 원래 불만은 프롬프트에만 실린다 — 서버가
-- 보관할 이유가 없고, 2회차 승인 요청 때는 demo_requests.reason으로 따로 들어간다).
-- 1000자는 기존 재촬영 요청(request-rerecord)의 REASON_MAX와 같은 값.
alter table projects drop constraint if exists projects_pending_script_note_len;
alter table projects add constraint projects_pending_script_note_len
  check (pending_script_note is null or length(pending_script_note) <= 1000);

-- 셀프 재촬영 1회 소진 플래그는 서버만 쓴다(소유자가 false로 되돌리면 무제한 촬영).
create or replace function guard_demo_columns() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- 특권 라이터는 예외: service_role(워커 + admin 라우트)과
  -- request_demo()(SECURITY DEFINER -> 테이블 소유자로 실행). 일반 세션만
  -- 'authenticated' / 'anon'으로 실행된다.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 엔드유저 INSERT는 파이프라인 관리 컬럼을 기본값 외로 넣을 수 없다.
    if new.demo_build_status  is not null
    or new.demo_source_type   is not null
    or new.demo_source_value  is not null
    or new.demo_video_url     is not null
    or new.demo_generated_at  is not null
    or new.demo_build_error   is not null
    or coalesce(new.demo_attempt_count, 0) <> 0
    or coalesce(new.rerecord_self_used, false) <> false then
      raise exception 'demo pipeline columns are managed by the server'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: 기존 로직(값이 실제로 바뀔 때만 거부).
  if new.demo_build_status  is distinct from old.demo_build_status
  or new.demo_source_type   is distinct from old.demo_source_type
  or new.demo_source_value  is distinct from old.demo_source_value
  or new.demo_video_url     is distinct from old.demo_video_url
  or new.demo_generated_at  is distinct from old.demo_generated_at
  or new.demo_attempt_count is distinct from old.demo_attempt_count
  or new.demo_build_error   is distinct from old.demo_build_error
  or new.rerecord_self_used is distinct from old.rerecord_self_used then
    raise exception 'demo pipeline columns are managed by the server'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
