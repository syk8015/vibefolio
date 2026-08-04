-- Pre-launch hardening (2026-08-04): storage enumeration lockdown + M18 + M19.
--
-- ORDER: run AFTER deploying the app change that writes portfolio_views with the
-- service role (app/api/track/route.ts) — otherwise view tracking 403s until deploy.
-- Rebuild order: this file runs after migration_rls_v2.sql (it replaces policies
-- created there).

-- ─── 1. Storage: stop anonymous enumeration of user files ─────────────
-- Both buckets stay public=true, so fetching an object by its exact public URL
-- (previews, OG images, embeds, avatars) is UNAFFECTED — the SELECT policy only
-- governs the storage list API and authenticated API reads. Replacing the open
-- read policy with owner-only read kills "list the bucket, download everything"
-- scripts while keeping every render path working. App code never lists these
-- buckets outside the service role (verified 2026-08-04).

drop policy if exists "공개 읽기 - project-files" on storage.objects;
create policy "owner read - project-files"
  on storage.objects for select
  using (
    bucket_id = 'project-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "공개 읽기 - avatars" on storage.objects;
create policy "owner read - avatars"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── 2. M18: username hardening ───────────────────────────────────────
-- Usernames are root-level paths (/{username}). profiles.username is unique,
-- but only exact-case — add case-insensitive uniqueness, and block names that
-- collide with real routes or invite impersonation.

create unique index if not exists profiles_username_lower_key
  on profiles (lower(username));

-- Mirrors lib/reservedUsernames.ts — keep the two lists in sync.
alter table profiles drop constraint if exists profiles_username_not_reserved;
alter table profiles add constraint profiles_username_not_reserved
  check (lower(username) <> all (array[
    'admin','api','auth','dashboard','login','signup','onboarding',
    'publish','privacy','terms','forgot-password','reset-password',
    'error','not-found',
    '_next','static','public','assets','favicon','robots','sitemap',
    'icon','apple-icon',
    'explore','watch','settings','account','help','support','docs',
    'blog','about','www','mail','email','root','system','official',
    'nookframe','null','undefined','me','new','edit'
  ]));

-- ─── 3. M19: portfolio_views default-deny insert ──────────────────────
-- The open anonymous insert policy let anyone spray rows directly at PostgREST,
-- bypassing the rate-limited /api/track route. The route now writes via the
-- service role (bypasses RLS), so dropping the policy leaves default-deny for
-- anon/authenticated. The owner-only SELECT policy stays as is.

drop policy if exists "누구나 방문 기록 추가" on portfolio_views;

-- ─── Verify (all four should hold) ────────────────────────────────────
-- 1. select count(*) from pg_policies where tablename = 'objects'
--      and policyname like 'owner read%';                        -- = 2
-- 2. select indexname from pg_indexes where tablename = 'profiles'
--      and indexname = 'profiles_username_lower_key';            -- 1 row
-- 3. insert into profiles (id, username) values (gen_random_uuid(), 'admin');
--                                    -- fails: profiles_username_not_reserved
-- 4. select count(*) from pg_policies where tablename = 'portfolio_views';
--                                    -- = 1 (owner select only)
