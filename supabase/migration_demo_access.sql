-- Nookframe Connect — demo-mode access info (업로드 개선 요청2, ClaudeHelp 피드백).
--
-- projects.demo_access jsonb: creator-supplied entry info for login-gated apps,
-- shape { url?, params?, note? }. The local recording worker reads it with the
-- job row (same channel as demo_user_hint): url+params decide the entry URL the
-- robot opens, note is injected into the explore briefing as untrusted data.
-- Ingest only STORES it — usage happens on the publish-time cookie-auth
-- trigger-demo → worker path, so the demo_* pipeline invariant is untouched.
--
-- Deliberately NOT added to guard_demo_columns() (migration_demo_quota.sql):
-- this is user CONTENT like demo_user_hint, so owners may write it directly
-- through their RLS update policy. NEVER credentials — by design the accepted
-- keys are url/params/note only (no plaintext account/password storage).
--
-- Size cap: url≤500 + params(≤12×120자) + note≤500 fits comfortably in 2KB;
-- the check also pins the top-level type to an object (not array/scalar).

alter table projects add column if not exists demo_access jsonb;

alter table projects drop constraint if exists projects_demo_access_shape;
alter table projects add constraint projects_demo_access_shape
  check (
    demo_access is null
    or (jsonb_typeof(demo_access) = 'object' and pg_column_size(demo_access) <= 2048)
  );
