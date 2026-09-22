// lib/nameFilter.ts의 금지어 목록 → supabase/migration_name_filter.sql 생성.
// 브라우저 검사와 DB 검사가 같은 목록을 쓰게 한 벌에서 만든다(손으로 두 벌 두면 갈라진다).
// `--check`면 파일을 쓰지 않고 지금 파일이 생성물과 같은지만 본다(npm test용).
import { readFileSync, writeFileSync } from "node:fs";
import { ABUSE_CONTAINS, ABUSE_EXACT, BRANDS_DISTINCT, BRANDS_EXACT } from "../lib/nameFilter";

const OUT = "supabase/migration_name_filter.sql";
const arr = (xs: string[]) => `array[${xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]::text[]`;

const sql = `-- 생성물 — 손으로 고치지 말 것. 원본은 lib/nameFilter.ts, 생성은 \`npm run namefilter:sql\`.
-- 이름·아이디 금지어(욕설·성적인 말·혐오·회사 이름 사칭)를 DB에서도 막는다.
-- 브라우저 검사를 건너뛰고 profiles에 직접 쓰는 요청 방어. 바뀐 값만 본다
-- (규칙 전에 정한 아이디 — 예: 운영 계정 claudehelp — 는 그대로 둔다).
-- 목록을 고쳤으면 이 파일 전체를 다시 실행하면 된다(전부 create or replace).

create or replace function public.nf_has_blocked_term(v text, kind text)
returns boolean
language sql
immutable
as $$
  with forms(f) as (
    values
      (regexp_replace(lower(v), '[[:space:]_.·~*-]+', '', 'g')),
      (regexp_replace(translate(lower(v), '013457$@', 'oieastsa'), '[[:space:]_.·~*-]+', '', 'g'))
  )
  select coalesce(v, '') <> '' and exists (
    select 1 from forms
    where f = any (
            ${arr([...ABUSE_EXACT, ...BRANDS_EXACT])}
            || case when kind = 'name' then ${arr(BRANDS_DISTINCT)} else array[]::text[] end
          )
       or exists (
            select 1
            from unnest(
              ${arr(ABUSE_CONTAINS)}
              || case when kind = 'username' then ${arr(BRANDS_DISTINCT)} else array[]::text[] end
            ) as w
            where position(w in f) > 0
          )
  );
$$;

create or replace function public.nf_profiles_name_filter()
returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from (case when tg_op = 'UPDATE' then old.username end)
     and public.nf_has_blocked_term(new.username, 'username') then
    raise exception 'username contains a blocked term' using errcode = '23514';
  end if;
  if new.name is distinct from (case when tg_op = 'UPDATE' then old.name end)
     and public.nf_has_blocked_term(new.name, 'name') then
    raise exception 'name contains a blocked term' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_name_filter on profiles;
create trigger profiles_name_filter
  before insert or update of username, name on profiles
  for each row execute function public.nf_profiles_name_filter();
`;

if (process.argv.includes("--check")) {
  let cur = "";
  try { cur = readFileSync(OUT, "utf8"); } catch {}
  if (cur !== sql) {
    console.log(`✗ ${OUT}가 lib/nameFilter.ts와 어긋났어요 — npm run namefilter:sql 후 SQL 재실행`);
    process.exit(1);
  }
  console.log(`✓ ${OUT} = lib/nameFilter.ts`);
} else {
  writeFileSync(OUT, sql);
  console.log(`wrote ${OUT}`);
}
