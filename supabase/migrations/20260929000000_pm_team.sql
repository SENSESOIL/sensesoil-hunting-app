-- ═════════════════════════════════════════════════════════════════════
-- 團隊（指揮中心 → 團隊）：員工卡牌、大頭照、外部職員／協力廠商／聯盟品牌
--
-- 先執行 20260928000000_pm_schema.sql，再執行這一份。可以重複執行。
-- 安全模型同 pm_*：RLS 開、不建 policy、只給伺服器（service_role）呼叫。
-- 圖片以 data URL 存在資料表（大頭照約 6KB、卡牌去背圖約 60–300KB），人數少，不另開 Storage。
-- ═════════════════════════════════════════════════════════════════════

-- 內部職員的個人資料（名單本身來自權限表，這裡只存 APP 內補充的資料）
create table if not exists public.pm_profiles (
  email       text        primary key,
  title       text,                        -- 職稱
  bio         text,                        -- 一句話介紹／專長
  avatar      text,                        -- 圓形大頭照（data:image/jpeg;base64,…，128px）
  card        text,                        -- 卡牌人像（去背＋制服，透明底）
  card_bg     text,                        -- 卡牌背景色組
  sort_order  integer,
  updated_at  timestamptz not null default now(),
  updated_by  text        not null default 'system',
  constraint pm_profiles_chk check (
        email = lower(btrim(email)) and position('@' in email) > 1
    and coalesce(char_length(title), 0) <= 30
    and coalesce(char_length(bio), 0)   <= 200
    and coalesce(char_length(avatar), 0) <= 60000
    and coalesce(char_length(card), 0)   <= 700000
    and coalesce(char_length(card_bg), 0) <= 20
  )
);

-- 外部職員、協力廠商（APP 內新增的；廠商CRM 的資料另外從試算表讀）、聯盟品牌
create table if not exists public.pm_contacts (
  id          text        primary key,
  kind        text        not null check (kind in ('external','vendor','brand')),
  name        text        not null,
  company     text,
  title       text,                        -- 職稱／工項／品牌類型
  phone       text,
  email       text,
  website     text,
  note        text,
  avatar      text,                        -- 頭像或品牌 logo（data URL）
  sort_order  integer     not null default 0,
  version     integer     not null default 1,
  created_at  timestamptz not null default now(),
  created_by  text        not null default 'system',
  updated_at  timestamptz not null default now(),
  updated_by  text        not null default 'system',
  constraint pm_contacts_chk check (
        char_length(id) between 1 and 64
    and btrim(name) <> '' and char_length(name) <= 60
    and coalesce(char_length(company), 0) <= 60
    and coalesce(char_length(title), 0)   <= 40
    and coalesce(char_length(phone), 0)   <= 40
    and coalesce(char_length(email), 0)   <= 120
    and coalesce(char_length(website), 0) <= 200
    and coalesce(char_length(note), 0)    <= 500
    and coalesce(char_length(avatar), 0)  <= 60000
  )
);
create index if not exists pm_contacts_kind_idx on public.pm_contacts (kind, sort_order);

drop trigger if exists pm_contacts_touch on public.pm_contacts;
create trigger pm_contacts_touch before update on public.pm_contacts
  for each row execute function public.pm_touch();


-- ───────────────────────── 函式 ─────────────────────────

-- 所有人的大頭照：{ email: dataUrl }（任務指派、頭像列用）
create or replace function public.pm_avatars(p jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.email, x.avatar), '{}'::jsonb)
    from public.pm_profiles as x
   where x.avatar is not null;
$$;

-- 團隊頁：個人資料（不含卡牌大圖）＋聯絡人
create or replace function public.pm_team_list(p jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'profiles', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', x.email, 'title', x.title, 'bio', x.bio, 'avatar', x.avatar,
               'card_bg', x.card_bg, 'sort_order', x.sort_order, 'has_card', x.card is not null,
               'updated_at', x.updated_at)), '[]'::jsonb)
        from public.pm_profiles as x),
    'contacts', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.kind, c.sort_order, c.name), '[]'::jsonb)
        from public.pm_contacts as c)
  );
$$;

-- 卡牌大圖：p { email } → { card, updated_at }
create or replace function public.pm_profile_card(p jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('card', x.card, 'updated_at', x.updated_at)
       from public.pm_profiles as x where x.email = lower(btrim(p ->> 'email'))),
    '{}'::jsonb);
$$;

-- p { actor, role, email, patch:{ title, bio, avatar, card, card_bg, sort_order } }
-- 每個人可以改自己的；manager 可以改所有人的。patch 裡有的欄位才更新，值為 null＝清除。
create or replace function public.pm_profile_save(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_email text := lower(btrim(coalesce(p ->> 'email', '')));
  v_patch jsonb := coalesce(p -> 'patch', '{}'::jsonb);
  v_row   public.pm_profiles;
begin
  if v_email = '' then
    raise exception 'pm_profile_save: email is required' using errcode = '22023';
  end if;
  if coalesce(p ->> 'role', 'member') <> 'manager' and v_email <> v_actor then
    return jsonb_build_object('status', 'forbidden');
  end if;
  insert into public.pm_profiles (email, updated_by) values (v_email, v_actor)
  on conflict (email) do nothing;
  select * into v_row from public.pm_profiles as x where x.email = v_email for update;
  update public.pm_profiles as x set
    title      = case when v_patch ? 'title'      then nullif(btrim(v_patch ->> 'title'), '')  else x.title end,
    bio        = case when v_patch ? 'bio'        then nullif(btrim(v_patch ->> 'bio'), '')    else x.bio end,
    avatar     = case when v_patch ? 'avatar'     then nullif(v_patch ->> 'avatar', '')        else x.avatar end,
    card       = case when v_patch ? 'card'       then nullif(v_patch ->> 'card', '')          else x.card end,
    card_bg    = case when v_patch ? 'card_bg'    then nullif(v_patch ->> 'card_bg', '')       else x.card_bg end,
    sort_order = case when v_patch ? 'sort_order' then (v_patch ->> 'sort_order')::integer     else x.sort_order end,
    updated_at = now(),
    updated_by = v_actor
  where x.email = v_email
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'updated_at', v_row.updated_at);
end;
$$;

-- p { actor, role, contact:{ id, kind, name, … } } → manager 限定
create or replace function public.pm_contact_save(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_in    jsonb := coalesce(p -> 'contact', '{}'::jsonb);
  v_row   public.pm_contacts;
begin
  if coalesce(p ->> 'role', '') <> 'manager' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if coalesce(btrim(v_in ->> 'id'), '') = '' then
    raise exception 'pm_contact_save: id is required' using errcode = '22023';
  end if;
  insert into public.pm_contacts as c (id, kind, name, company, title, phone, email, website, note, avatar, sort_order, created_by, updated_by)
  values (
    btrim(v_in ->> 'id'), v_in ->> 'kind', btrim(coalesce(v_in ->> 'name', '')),
    nullif(btrim(v_in ->> 'company'), ''), nullif(btrim(v_in ->> 'title'), ''), nullif(btrim(v_in ->> 'phone'), ''),
    nullif(lower(btrim(v_in ->> 'email')), ''), nullif(btrim(v_in ->> 'website'), ''), nullif(btrim(v_in ->> 'note'), ''),
    nullif(v_in ->> 'avatar', ''), coalesce((v_in ->> 'sort_order')::integer, 0), v_actor, v_actor)
  on conflict (id) do update set
    kind = excluded.kind, name = excluded.name, company = excluded.company, title = excluded.title,
    phone = excluded.phone, email = excluded.email, website = excluded.website, note = excluded.note,
    avatar = excluded.avatar, sort_order = excluded.sort_order, updated_by = v_actor
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'contact', to_jsonb(v_row));
end;
$$;

-- p { actor, role, id } → manager 限定
create or replace function public.pm_contact_delete(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
begin
  if coalesce(p ->> 'role', '') <> 'manager' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  delete from public.pm_contacts as c where c.id = p ->> 'id';
  return jsonb_build_object('status', 'ok');
end;
$$;


-- ───────────────────────── 權限 ─────────────────────────

alter table public.pm_profiles enable row level security;
alter table public.pm_contacts enable row level security;
revoke all on table public.pm_profiles, public.pm_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.pm_profiles, public.pm_contacts to service_role;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'pm\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

comment on table public.pm_profiles is '員工在 APP 內的補充資料：職稱、大頭照、卡牌人像。名單以權限表為準。';
comment on table public.pm_contacts is '外部職員、協力廠商（APP 新增）、聯盟品牌。';

notify pgrst, 'reload schema';
