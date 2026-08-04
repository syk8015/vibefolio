-- Pre-launch hardening (2026-08-04): storage enumeration lockdown + M18 + M19.
--
-- ORDER: run AFTER deploying the app change that writes portfolio_views with the
-- service role (app/api/track/route.ts) — otherwise view tracking 403s until deploy.
-- Rebuild order: this file runs after migration_rls_v2.sql (it replaces policies
-- created there).
--
-- 2026-08-04 revision — WHY THE DO BLOCKS: the first version dropped policies by
-- the names used in this repo's migrations. That silently no-opped in prod: both
-- storage.objects and portfolio_views carry policies created by hand in the
-- Supabase dashboard under different names (portfolio_views itself lived outside
-- migrations until M17). Permissive policies OR together, so a leftover open
-- policy kept granting access even after the new restrictive one was added.
-- Dropping by catalog lookup instead of by name is what actually closes the door.
-- Safe to re-run.

-- ─── 1. Storage: stop anonymous enumeration of user files ─────────────
-- Both buckets stay public=true, so fetching an object by its exact public URL
-- (/object/public/... — previews, OG images, embeds, avatars) is UNAFFECTED:
-- that path bypasses RLS for public buckets. These policies govern the storage
-- list API and authenticated reads, which is what "download the whole bucket"
-- scripts need. App code never lists these buckets outside the service role
-- (verified 2026-08-04: only app/api/account and demo-assets, both admin client).

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy "owner read - project-files"
  on storage.objects for select
  using (
    bucket_id = 'project-files'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "owner read - avatars"
  on storage.objects for select
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- The loop above also removes any FOR ALL policy (a dashboard-made policy can be
-- FOR ALL, and that would be the leak while looking like a write rule). Restate
-- owner writes here so upload/replace/delete survive no matter what was dropped;
-- these duplicate the per-command policies from migration_rls_v2 harmlessly
-- (permissive policies OR together).
do $$
declare
  b text;
  c text;
begin
  foreach b in array array['project-files', 'avatars'] loop
    foreach c in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on storage.objects', 'owner ' || c || ' - ' || b);
      if c = 'insert' then
        execute format(
          'create policy %I on storage.objects for insert to authenticated
             with check (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])',
          'owner insert - ' || b, b);
      else
        execute format(
          'create policy %I on storage.objects for %s to authenticated
             using (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])',
          'owner ' || c || ' - ' || b, c, b);
      end if;
    end loop;
  end loop;
end $$;

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
-- An open anonymous insert policy let anyone spray rows straight at PostgREST,
-- bypassing the rate-limited /api/track route. That route now writes with the
-- service role (bypasses RLS), so removing every INSERT policy leaves
-- default-deny for anon/authenticated. The owner-only SELECT policy stays.

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'portfolio_views' and cmd in ('INSERT', 'ALL')
  loop
    execute format('drop policy %I on portfolio_views', p.policyname);
  end loop;
end $$;

alter table portfolio_views enable row level security;

-- ─── Verify: this SELECT must return exactly the two owner-read policies
-- for storage, and no INSERT policy for portfolio_views. ──────────────
select tablename, policyname, cmd, roles::text
from pg_policies
where (schemaname = 'storage' and tablename = 'objects')
   or (schemaname = 'public'  and tablename = 'portfolio_views')
order by tablename, cmd, policyname;
