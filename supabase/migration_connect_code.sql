-- Nookframe — 연결 페어링 코드 (1회용). 2026-09-16
--
-- 배경: [프롬프트 복사]는 그 순간 PAT를 발급해 프롬프트 1단계
-- (`npx nookframe@latest login <토큰>`)에 **평문으로 박아** 넣었다. 사람은 그 프롬프트를
-- AI 채팅창에 붙여넣으므로, 살아 있는 크리덴셜이 대화 기록에 영구히 남는다
-- (사용자 전역 규칙 "비밀은 파일에 두고 코드가 읽는다, 채팅창으로 받지 않는다"와 정면 충돌).
--
-- 사용자 확정(2026-09-16): 프롬프트에 들어가는 것은 **1회용 페어링 코드**(30분·1회)로 바꾸고,
-- CLI `login <코드>`가 서버에서 진짜 토큰으로 교환해 ~/.nookframe/config.json에 저장한다.
-- 대화 기록에 남는 것은 이미 죽은 코드라 쓸모가 없다.
--
-- 예전에 기각된 "1회용 토큰"과 다르다: 1회용인 것은 **코드**뿐이고, 교환으로 받은 PAT는
-- 계속 산다 — 같은 초안을 다시 올리는 upsert·재발행 경로가 그대로 유지된다.

create table if not exists connect_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  -- sha256(raw hex). raw 코드는 발급 응답(=프롬프트)에만 존재한다. api_tokens와 같은 규약.
  code_hash  text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- 교환된 시각. 1회용 판정은 "used_at is null"이고, 소비는 조건부 UPDATE 한 방으로
  -- 일어나 같은 코드를 두 번 교환하는 경쟁 상태를 막는다(lib/connectCode.ts).
  used_at    timestamptz
);

-- 교환(해시 동등 조회)은 unique 인덱스가 받고, 이 인덱스는 발급 때 유저의 낡은 코드를
-- 청소하는 경로용이다(크론 없이 발급 시점에 같이 치운다).
create index if not exists connect_codes_user on connect_codes (user_id);

alter table connect_codes enable row level security;
-- 정책을 하나도 만들지 않는다 = default-deny. 발급·교환·청소는 전부 서비스롤
-- 서버 경로(app/api/connect/*)에서만 일어나고, 소유자도 자기 코드 해시를 읽을 이유가 없다.
