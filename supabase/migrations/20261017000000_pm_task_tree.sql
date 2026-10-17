-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：任務的層級（子任務）與標籤
--
-- 目標專案：APP 自己的 Supabase 專案（同 20260928000000_pm_schema.sql）。
-- 用法：Supabase → SQL Editor → 整段貼上 → Run。可以重複執行。
--       必須先執行過 20260928000000_pm_schema.sql、20261014000000_pm_goals.sql。
--
-- 內容：
--   pm_tasks.parent_id   上一層任務（子任務；像提醒事項一樣只有一層）。上層刪除時，子任務變回一般任務
--   pm_tasks.meta        標籤：工種、工項、工法、工審、工責、報價、合約、定位、工料、工期…（jsonb）
--   pm_task_set_extra    更新 parent_id、meta、goal_id
--
-- 為什麼要另一支函式：pm_task_save 修改既有任務時是逐欄 update，後來加的欄位
-- （goal_id、parent_id、meta）不會被寫入。API 在 pm_task_save 之後，若有這些欄位就再呼叫這支。
-- 權限與 pm_task_save 一致：manager 都能改；member 只能改自己建立的任務。
-- ═════════════════════════════════════════════════════════════════════


-- ───────────────────────── 1. 欄位 ─────────────────────────

alter table public.pm_tasks
  add column if not exists parent_id text references public.pm_tasks(id) on delete set null,
  add column if not exists meta jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pm_tasks_tree_chk') then
    alter table public.pm_tasks add constraint pm_tasks_tree_chk check (
          (parent_id is null or parent_id <> id)
      and jsonb_typeof(meta) = 'object'
      and octet_length(meta::text) <= 8000
    );
  end if;
end $$;

create index if not exists pm_tasks_parent_idx on public.pm_tasks (parent_id) where parent_id is not null;

-- pm_task_save 新增時以 jsonb_populate_record 建整列，沒帶 meta 會是 null（不套用預設值）→ 補成 {}
create or replace function public.pm_tasks_meta_default()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  new.meta := coalesce(new.meta, '{}'::jsonb);
  return new;
end;
$;

drop trigger if exists pm_tasks_meta_default on public.pm_tasks;
create trigger pm_tasks_meta_default before insert or update on public.pm_tasks
  for each row execute function public.pm_tasks_meta_default();


-- ───────────────────────── 2. 函式 ─────────────────────────

-- p: { actor, role, id, extra: { parent_id?, meta?, goal_id? } } → { status, task }
create or replace function public.pm_task_set_extra(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor   text := public.pm__actor(p);
  v_manager boolean := coalesce(p ->> 'role', 'member') = 'manager';
  v_id      text := nullif(btrim(coalesce(p ->> 'id', '')), '');
  v_in      jsonb := coalesce(p -> 'extra', '{}'::jsonb);
  v_old     public.pm_tasks;
  v_new     public.pm_tasks;
  v_parent  public.pm_tasks;
  v_pid     text;
begin
  select * into v_old from public.pm_tasks as t where t.id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not v_manager and v_old.created_by is distinct from v_actor then
    return jsonb_build_object('status', 'forbidden', 'task', to_jsonb(v_old));
  end if;
  perform set_config('pm.actor', v_actor, true);

  v_new := v_old;

  if v_in ? 'parent_id' then
    v_pid := nullif(btrim(coalesce(v_in ->> 'parent_id', '')), '');
    if v_pid is not null then
      select * into v_parent from public.pm_tasks as t where t.id = v_pid;
      -- 上層必須存在、同一個專案、本身不是子任務（只有一層），而且不能是自己
      if not found or v_parent.project_code <> v_old.project_code or v_parent.parent_id is not null or v_pid = v_id then
        return jsonb_build_object('status', 'invalid', 'task', to_jsonb(v_old));
      end if;
      -- 自己底下已經有子任務時，不能再變成別人的子任務
      if exists (select 1 from public.pm_tasks as c where c.parent_id = v_id) then
        return jsonb_build_object('status', 'invalid', 'task', to_jsonb(v_old));
      end if;
    end if;
    v_new.parent_id := v_pid;
  end if;

  if v_in ? 'meta' then
    if jsonb_typeof(v_in -> 'meta') <> 'object' then
      return jsonb_build_object('status', 'invalid', 'task', to_jsonb(v_old));
    end if;
    v_new.meta := v_in -> 'meta';
  end if;

  if v_in ? 'goal_id' then
    v_new.goal_id := nullif(btrim(coalesce(v_in ->> 'goal_id', '')), '');
  end if;

  if v_new.parent_id is not distinct from v_old.parent_id
     and v_new.meta is not distinct from v_old.meta
     and v_new.goal_id is not distinct from v_old.goal_id then
    return jsonb_build_object('status', 'unchanged', 'task', to_jsonb(v_old));
  end if;

  update public.pm_tasks as t set
    parent_id = v_new.parent_id, meta = v_new.meta, goal_id = v_new.goal_id, updated_by = v_actor
  where t.id = v_id
  returning * into v_new;
  return jsonb_build_object('status', 'ok', 'task', to_jsonb(v_new));
end;
$$;


-- ───────────────────────── 3. 權限 ─────────────────────────

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'pm_task_set_extra'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
