-- 생성물 — 손으로 고치지 말 것. 원본은 lib/nameFilter.ts, 생성은 `npm run namefilter:sql`.
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
            array['ass','cum','tit','tits','fag','dick','piss','slut','whore','hoe','cock','rape','pedo','spic','prick','nude','loli','apple','meta','amazon','adobe','intel','oracle','sony','uber','airbnb','spotify','x','line','gemini','copilot','figma','notion','slack','discord','reddit','zoom','cursor','toss','애플','토스']::text[]
            || case when kind = 'name' then array['google','youtube','gmail','microsoft','openai','chatgpt','anthropic','claude','samsung','netflix','instagram','facebook','whatsapp','tiktok','twitter','linkedin','github','paypal','nvidia','tesla','disney','nintendo','playstation','coupang','kakao','naver','nookframe','vercel','supabase','lovable','replit','삼성','네이버','카카오','구글','쿠팡','넷플릭스','유튜브','누크프레임']::text[] else array[]::text[] end
          )
       or exists (
            select 1
            from unnest(
              array['fuck','shit','bitch','bastard','asshole','dickhead','motherf','cunt','wank','bollock','twat','porn','hentai','blowjob','handjob','dildo','vagina','penis','boob','pussy','orgasm','masturb','nsfw','milf','sex','xxx','onlyfans','pornhub','xvideos','lolicon','nigger','nigga','faggot','retard','chink','kike','tranny','nazi','hitler','kkk','씨발','시발','씨빨','ㅅㅂ','ㅆㅂ','병신','ㅂㅅ','좆','존나','지랄','ㅈㄹ','개새끼','새끼','미친놈','미친년','썅','느금','섹스','보지','자지','야동','강간','몰카','창녀','틀딱','한남충','김치녀','짱깨','쪽바리']::text[]
              || case when kind = 'username' then array['google','youtube','gmail','microsoft','openai','chatgpt','anthropic','claude','samsung','netflix','instagram','facebook','whatsapp','tiktok','twitter','linkedin','github','paypal','nvidia','tesla','disney','nintendo','playstation','coupang','kakao','naver','nookframe','vercel','supabase','lovable','replit','삼성','네이버','카카오','구글','쿠팡','넷플릭스','유튜브','누크프레임']::text[] else array[]::text[] end
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
