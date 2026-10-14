-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：公司目標（任務追蹤 →「目標」分頁、月曆上的目標橫條）
--
-- 目標專案：APP 自己的 Supabase 專案（同 20260928000000_pm_schema.sql）。
-- 用法：Supabase → SQL Editor → 整段貼上 → Run。可以重複執行。
--       必須先執行過 20260928000000_pm_schema.sql。
--
-- 內容：
--   pm_goals            公司目標：名稱、負責人、期間、顏色、說明
--   pm_tasks.goal_id    任務所屬的目標（目標刪除時自動清空，不刪任務）
--   pm_goals_list       讀取（每個人都看得到公司目標）
--   pm_goal_save        新增／修改（只有 manager；帶 base_version 防止同時編輯互蓋）
--   pm_goal_delete      刪除（只有 manager）
--
-- 目標進度不存資料庫：由前端依連結的任務即時計算（完成件數／總件數）。
-- 安全模型同 pm_schema：開 RLS、不建 policy，只有伺服器的 service role 能呼叫。
-- ═════════════════════════════════════════════════════════════════════


-- ───────────────────────── 1. 資料表 ─────────────────────────

create table if not exists public.pm_goals (
  id           text        primary key,                 -- 前端產生（g-3f9a1c2b7d0e）
  title        text        not null,
  owner_email  text,                                    -- 負責人
  owner_name   text,
  start_on     date,
  due_on       date,
  color        text,                                    -- 甘特圖與月曆橫條的顏色（#RRGGBB）
  note         text,                                    -- 說明／衡量方式
  sort_order   integer     not null default 0,
  archived     boolean     not null default false,
  version      integer     not null default 1,
  created_at   timestamptz not null default now(),
  created_by   text        not null default 'system',
  updated_at   timestamptz not null default now(),
  updated_by   text        not null default 'system',
  constraint pm_goals_chk check (
        char_length(id) between 1 and 64
    and btrim(title) <> '' and char_length(title) <= 80
    and (due_on is null or start_on is null or due_on >= start_on)
    and (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
    and coalesce(char_length(note), 0) <= 2000
    and coalesce(char_length(owner_email), 0) <= 120
    and coalesce(char_length(owner_name), 0) <= 50
    and sort_order >= 0
    and version >= 1
  )
);

alter table public.pm_tasks
  add column if not exists goal_id text references public.pm_goals(id) on delete set null;

create index if not exists pm_goals_sort_idx on public.pm_goals (sort_order);
create index if not exists pm_tasks_goal_id_idx on public.pm_tasks (goal_id) where goal_id is not null;

drop trigger if exists pm_goals_touch on public.pm_goals;
create trigger pm_goals_touch before update on public.pm_goals
  for each row execute function public.pm_touch();


-- ───────────────────────── 2. 函式 ─────────────────────────

-- 讀取：全部未封存的目標（每個人都看得到）
create or replace function public.pm_goals_list(p jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.pm__actor(p);
  return (
    select coalesce(jsonb_agg(to_jsonb(g) order by g.sort_order, g.start_on nulls last, g.created_at), '[]'::jsonb)
      from public.pm_goals as g
     where not g.archived
  );
end;
$$;

-- 新增／修改：只有 manager
create or replace function public.pm_goal_save(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor   text := public.pm__actor(p);
  v_manager boolean := coalesce(p ->> 'role', 'member') = 'manager';
  v_in      jsonb := coalesce(p -> 'goal', '{}'::jsonb);
  v_id      text := nullif(btrim(coalesce(v_in ->> 'id', '')), '');
  v_base    integer := nullif(p ->> 'base_version', '')::integer;
  v_patch   jsonb;
  v_old     public.pm_goals;
  v_new     public.pm_goals;
begin
  if not v_manager then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if v_id is null then
    raise exception 'pm_goal_save: goal.id is required' using errcode = '22023';
  end if;

  v_patch := v_in - array['id','version','created_at','created_by','updated_at','updated_by'];

  select * into v_old from public.pm_goals as g where g.id = v_id for update;
  if found then
    if v_base is not null and v_base <> v_old.version then
      if to_jsonb(v_old) @> v_patch then
        return jsonb_build_object('status', 'unchanged', 'goal', to_jsonb(v_old));
      end if;
      return jsonb_build_object('status', 'conflict', 'goal', to_jsonb(v_old));
    end if;
    v_new := jsonb_populate_record(v_old, v_patch);
    v_new.updated_by := v_actor;
    update public.pm_goals as g set
      title = v_new.title, owner_email = v_new.owner_email, owner_name = v_new.owner_name,
      start_on = v_new.start_on, due_on = v_new.due_on, color = v_new.color, note = v_new.note,
      sort_order = v_new.sort_order, archived = v_new.archived, updated_by = v_actor
     where g.id = v_id
     returning * into v_new;
    return jsonb_build_object('status', 'ok', 'goal', to_jsonb(v_new));
  end if;

  if v_base is not null and v_base > 0 then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_new := jsonb_populate_record(null::public.pm_goals, v_patch || jsonb_build_object('id', v_id));
  insert into public.pm_goals (id, title, owner_email, owner_name, start_on, due_on, color, note, sort_order, archived, created_by, updated_by)
  values (
    v_id, v_new.title, v_new.owner_email, v_new.owner_name, v_new.start_on, v_new.due_on, v_new.color, v_new.note,
    coalesce(v_new.sort_order, (select coalesce(max(g.sort_order) + 1, 0) from public.pm_goals as g)),
    coalesce(v_new.archived, false), v_actor, v_actor
  )
  returning * into v_new;
  return jsonb_build_object('status', 'ok', 'goal', to_jsonb(v_new));
end;
$$;

-- 刪除：只有 manager；連結的任務 goal_id 會自動清空
create or replace function public.pm_goal_delete(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_manager boolean := coalesce(p ->> 'role', 'member') = 'manager';
  v_id      text := nullif(btrim(coalesce(p ->> 'id', '')), '');
begin
  perform public.pm__actor(p);
  if not v_manager then
    return jsonb_build_object('status', 'forbidden');
  end if;
  delete from public.pm_goals as g where g.id = v_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;


-- ───────────────────────── 3. RLS 與權限 ─────────────────────────

alter table public.pm_goals enable row level security;
-- 刻意不建立任何 policy：anon / authenticated 一律被擋。
revoke all on table public.pm_goals from public, anon, authenticated;
grant select, insert, update, delete on table public.pm_goals to service_role;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('pm_goals_list', 'pm_goal_save', 'pm_goal_delete')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

comment on table public.pm_goals is '公司目標：期間、負責人；任務以 pm_tasks.goal_id 連結。只供伺服器 service role 存取。';

notify pgrst, 'reload schema';
