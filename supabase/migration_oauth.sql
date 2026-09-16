-- Nookframe — 원격 MCP용 OAuth (2026-09-17)
--
-- 왜: 셸 없는 채팅창 AI(claude.ai 웹 등)는 `npx nookframe`을 실행할 수 없다. 그 AI가
-- 우리 서버를 직접 부르게 하는 통로가 원격 MCP(app/api/mcp)이고, 거기 붙는 인증이
-- 이것이다. 사용자 확정(2026-09-17): 요청 헤더에 PAT를 손으로 넣는 A안이 아니라
-- OAuth(B안) — 비개발자가 [허용] 한 번으로 끝나고, 살아 있는 토큰을 사람이 복사해
-- 옮기지 않는다(전역 규칙 "비밀은 파일에 두고 코드가 읽는다"와 같은 방향).
--
-- 설계 요지: **토큰 척추를 늘리지 않는다.** OAuth 액세스 토큰도 기존 api_tokens 행
-- 하나로 산다(같은 nf_live_ 스킴). 그래야 verifyToken·ingestAuth·연결 패널의 토큰
-- 목록·[폐기] 버튼이 전부 그대로 동작하고, 인제스트 라우트는 한 줄도 안 고쳐도 된다.
-- OAuth가 더하는 것은 두 가지뿐: (1) 만료·갱신 컬럼 (2) 인증 코드 테이블.

-- ---------------------------------------------------------------------------
-- 1. api_tokens 확장 — 만료·갱신·발급자
-- ---------------------------------------------------------------------------
-- 기존 PAT 행은 이 컬럼들이 전부 null이다 = "만료 없음, 갱신 없음, 사람이 만든 것".
-- 동작 불변: verifyToken의 만료 검사는 `expires_at is null or expires_at > now()`.
alter table api_tokens add column if not exists expires_at timestamptz;

-- 갱신 토큰(refresh). 액세스 토큰과 같은 행에 산다 — 한 행 = 한 개의 연결(grant).
-- sha256만 저장하는 규약은 token_hash와 동일. 공개 클라이언트(Claude)는 갱신 때마다
-- 새 갱신 토큰으로 회전시켜야 하므로(OAuth 2.1) 이 두 컬럼은 갱신마다 덮인다.
alter table api_tokens add column if not exists refresh_hash text;
alter table api_tokens add column if not exists refresh_expires_at timestamptz;

-- 누가 받아 간 토큰인가. CIMD에서는 client_id가 곧 https URL이다
-- (예: https://claude.ai/oauth/…-client-metadata). 목록 UI가 "Claude 커넥터"라고
-- 이름 붙이는 근거이자, 같은 클라이언트가 다시 승인할 때 옛 연결을 폐기하는 키다.
alter table api_tokens add column if not exists oauth_client_id text;

-- 승인된 범위. 지금은 한 가지(projects:write)뿐이지만, 나중에 읽기 전용 범위를
-- 더할 때 행마다 남아 있어야 소급 판정이 가능하다.
alter table api_tokens add column if not exists scope text;

-- 갱신 토큰 조회(해시 동등)용. 부분 unique — 옛 PAT 행은 null이라 대상이 아니다.
create unique index if not exists api_tokens_refresh_hash
  on api_tokens (refresh_hash) where refresh_hash is not null;

-- "이 클라이언트가 이 유저에게 받아 둔 살아 있는 연결" 조회 — 재승인 때 옛 것을
-- 폐기하는 경로가 탄다(유저당 토큰 상한 10개를 재승인으로 소진하지 않게).
create index if not exists api_tokens_oauth_client
  on api_tokens (user_id, oauth_client_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- 2. 인증 코드 (authorization code + PKCE)
-- ---------------------------------------------------------------------------
-- 사람이 동의 화면에서 [허용]을 누른 순간 만들어지고, Claude가 곧바로 토큰으로
-- 바꿔 간다. connect_codes와 같은 규율: 해시만 저장 · 짧은 수명 · 1회용이며 소비는
-- 조건부 UPDATE 한 방(같은 코드가 동시에 두 번 들어와도 한쪽만 가져간다).
create table if not exists oauth_codes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  -- sha256(raw hex). raw 코드는 리다이렉트 주소에만 잠깐 존재한다.
  code_hash      text not null unique,
  -- CIMD라 client_id는 https URL 그 자체다. 문자열 단순 비교로만 다룬다(스펙 요구):
  -- 포트·기본포트 정규화를 하면 서로 다른 클라이언트가 같은 것으로 취급된다.
  client_id      text not null,
  -- 이 코드를 넘겨줄 주소. 토큰 교환 때 제시된 값과 **정확히** 같아야 한다.
  redirect_uri   text not null,
  -- PKCE S256 — code_verifier의 sha256을 base64url한 값. Claude는 예외 없이 보낸다.
  code_challenge text not null,
  -- RFC 8707 resource — 이 코드로 받은 토큰이 어느 서버용인지. 우리 MCP 주소 하나뿐이지만
  -- 토큰이 남의 서버로 재사용되는 것을 막는 근거라 코드에 박아 둔다.
  resource       text,
  scope          text,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz
);

-- 발급 시점에 그 유저의 낡은 코드를 같이 치우는 경로용(크론 없이).
create index if not exists oauth_codes_user on oauth_codes (user_id);

alter table oauth_codes enable row level security;
-- 정책을 하나도 만들지 않는다 = default-deny. 발급·교환·청소는 전부 서비스롤
-- 서버 경로(app/api/oauth/*)에서만 일어난다 — connect_codes와 같은 판단.

-- ---------------------------------------------------------------------------
-- 3. CIMD 문서 캐시
-- ---------------------------------------------------------------------------
-- client_id URL을 매 요청 가져오면 (1) Claude의 10초 예산을 우리가 까먹고
-- (2) 남의 서버에 우리가 트래픽을 만든다. 스펙도 HTTP 캐시 헤더를 존중하라고 한다.
-- 실패·잘못된 문서는 **캐시하지 않는다**(스펙 MUST) — 그래서 성공한 문서만 들어온다.
create table if not exists oauth_client_docs (
  client_id   text primary key,
  document    jsonb not null,
  fetched_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table oauth_client_docs enable row level security;
-- 정책 없음 = default-deny(서비스롤 전용). 공개 문서를 캐시한 것뿐이라 비밀은 없지만,
-- 유저가 읽을 이유도 없다.
