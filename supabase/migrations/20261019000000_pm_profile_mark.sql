-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：清單上的「代表字」（大頭照旁邊顯示的一個字）
--
-- 目標專案：APP 自己的 Supabase 專案。
-- 用法：Supabase → SQL Editor → 整段貼上 → Run。可以重複執行。
--       必須先執行過 20260929000000_pm_team.sql。
--
-- 規則（API 檢查）：名字裡的其中一個字（例：彭詩渝 → 渝），或兩個英文字母（例：SS）。
-- 沒設定時，畫面上用名字的最後一個字。
-- ═════════════════════════════════════════════════════════════════════

alter table public.pm_profiles add column if not exists mark text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pm_profiles_mark_chk') then
    alter table public.pm_profiles add constraint pm_profiles_mark_chk check (coalesce(char_length(mark), 0) <= 2);
  end if;
end $$;

-- 全 APP 的代表字目錄：{ email: mark }
create or replace function public.pm_marks(p jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.email, x.mark), '{}'::jsonb)
    from public.pm_profiles as x
   where x.mark is not null;
$$;

-- 團隊頁：個人資料（多了 mark）＋聯絡人
create or replace function public.pm_team_list(p jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'profiles', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', x.email, 'title', x.title, 'bio', x.bio, 'avatar', x.avatar, 'mark', x.mark,
               'card_bg', x.card_bg, 'sort_order', x.sort_order, 'has_card', x.card is not null,
               'updated_at', x.updated_at)), '[]'::jsonb)
        from public.pm_profiles as x),
    'contacts', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.kind, c.sort_order, c.name), '[]'::jsonb)
        from public.pm_contacts as c)
  );
$$;

-- 個人資料（多了 mark）
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
    mark       = case when v_patch ? 'mark'       then nullif(btrim(v_patch ->> 'mark'), '')   else x.mark end,
    updated_at = now(),
    updated_by = v_actor
  where x.email = v_email
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'updated_at', v_row.updated_at);
end;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('pm_marks', 'pm_team_list', 'pm_profile_save')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
