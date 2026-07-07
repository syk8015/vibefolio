-- ============================================================================
-- DEMO QUOTA TEST HARNESS  (manual — NOT a migration; do not apply as schema)
-- ============================================================================
-- Run sections one at a time in Supabase SQL Editor. Everything here is $0 as
-- long as the local worker is OFF (`npm run demo:worker` not running): triggers
-- only ever create rows; nothing records. The SQL Editor runs as a privileged
-- role, so it can set up fixtures the app's guard trigger blocks for end users
-- — that is exactly what lets us test each limit in isolation.
--
-- Caps enforced by request_demo() (keep in sync with lib/demoQuota.ts):
--   * 1 video per project (2 admitted attempts, then locked)
--   * 2 auto demos / user / 24h  (3rd upload -> held)
--   * 40 admitted / 24h globally (-> held, reason 'global')
--   * 40 drains / 24h at the worker (wallet backstop)
--
-- Typical run: RESET -> pick a CASE -> do its UI action -> INSPECT -> TEARDOWN.
-- Set your test username once: replace YOUR_USERNAME where it appears (cases B).
-- ============================================================================


-- === INSPECT ================================================================
-- Current state. Safe to run anytime.
select title, demo_build_status, demo_attempt_count,
       (demo_video_url is not null) as has_video
from projects order by created_at desc limit 8;

select kind, count(*) as n from demo_events group by kind order by kind;

select kind, status, reason, created_at
from demo_requests order by created_at desc limit 8;


-- === RESET ==================================================================
-- Wipe the counters + approval queue for a clean run. Pre-launch this is safe
-- (both tables are new and hold only quota bookkeeping). Does NOT touch projects.
-- truncate demo_events;
-- delete from demo_requests;


-- === CASE A — normal admit (baseline) =======================================
-- Under all caps: add ONE project with any URL in the dashboard.
-- EXPECT: badge "시연 영상 만드는 중" (pending); attempt_count = 1; one 'auto' event.


-- === CASE B — per-user daily cap -> held (reason: user) ======================
-- Seed 2 'auto' events for your user so your very next add hits the cap.
-- insert into demo_events (user_id, project_id, kind)
-- select id, null, 'auto' from profiles where username = 'YOUR_USERNAME'
-- union all
-- select id, null, 'auto' from profiles where username = 'YOUR_USERNAME';
--   Then add ONE project in the dashboard.
--   EXPECT: badge "승인 대기 · 이미지 표시" (held);
--           demo_requests -> over_cap / pending / 'Daily per-user upload limit reached'.


-- === CASE F — global daily cap -> held (reason: global) =====================
-- Seed 40 global 'auto' events (user_id null so they don't affect any per-user count).
-- insert into demo_events (user_id, project_id, kind)
-- select null, null, 'auto' from generate_series(1, 40);
--   Then add ONE project (as a user under their own 2/day cap).
--   EXPECT: held; demo_requests reason 'Daily global capacity reached'.
-- Cleanup this case only:
-- delete from demo_events where user_id is null and project_id is null and kind = 'auto';


-- === CASE C — project already has a video -> re-record is admin-gated ========
-- Force a project to look "done" with a video (paste an id from INSPECT).
-- update projects set demo_build_status = 'done',
--        demo_video_url = 'https://example.com/fake.mp4'
--  where id = 'PASTE_PROJECT_ID';
--   Dashboard: the re-record button on that row opens the "재촬영 요청" modal
--   (it does NOT re-shoot). Submitting creates demo_requests rerecord/pending.
--   The trigger-demo route would answer 409 ALREADY_HAS_DEMO for this project.


-- === CASE D — first-take retry budget spent -> ATTEMPT_LIMIT =================
-- update projects set demo_build_status = 'failed',
--        demo_attempt_count = 2, demo_video_url = null
--  where id = 'PASTE_PROJECT_ID';
--   Dashboard: "다시 시도" escalates to the 재촬영 요청 modal (route 409 ATTEMPT_LIMIT).


-- === CASE H — bypass block: end users CANNOT write demo_* directly ===========
-- Impersonate an authenticated user and attempt the exact bypass the guard closes.
-- EXPECT this block to FAIL with:
--   ERROR: demo pipeline columns are managed by the server
-- That error means the guard works. If it reports success, the guard is NOT active.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    (select json_build_object('sub', user_id, 'role', 'authenticated')::text
       from projects order by id limit 1), true);
  update projects set demo_build_status = 'pending'
   where id = (select id from projects order by id limit 1);
rollback;


-- === CASE G — worker drain ceiling (optional; needs the worker) =============
-- Seed 40 'drain' events, then start the worker with a pending row present.
-- SAFE: at the ceiling the worker refuses to record — it just logs and idles.
-- insert into demo_events (user_id, project_id, kind)
-- select null, null, 'drain' from generate_series(1, 40);
--   Run `npm run demo:worker`; EXPECT log: "daily drain ceiling (40) reached".
-- Cleanup:
-- delete from demo_events where user_id is null and project_id is null and kind = 'drain';


-- === ADMIN (I/J) — approve / reject (UI, no SQL) ============================
-- With a held or rerecord request present, open /admin (logged in as an admin):
--   Approve -> that project flips to 'pending', demo_events gains one 'approved',
--              the request row becomes 'approved'. (Re-run INSPECT to confirm.)
--   Reject  -> the request becomes 'rejected'; a held project keeps showing the
--              fallback image.


-- === TEARDOWN ===============================================================
-- Remove test data. (Prefix test projects with ZZTEST to make this one-liner work,
-- or delete them from the dashboard.)
-- delete from projects where title like 'ZZTEST%';
-- truncate demo_events;
-- delete from demo_requests;
