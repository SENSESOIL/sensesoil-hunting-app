-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：專案的「可編輯的人」
-- 必須先執行過 20260928000000_pm_schema.sql。可以重複執行。
--
--   pm_projects.editors      可編輯的人（email 陣列）：甘特圖「編輯」、這個專案的任務都能改（和管理者一樣）
--   pm_project_set_editors   設定可編輯的人（管理者）
--   pm_project_can_edit      某人能不能編輯某個專案（用專案代碼或任務 id 查）
-- ═════════════════════════════════════════════════════════════════════

alter table public.pm_projects add column if not exists editors text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pm_projects_editors_chk') then
    alter table public.pm_projects add constraint pm_projects_editors_chk check (coalesce(cardinality(editors), 0) <= 50);
  end if;
end $$;

-- p: { actor, role, code, editors: [email…] } → { status, editors }
create or replace function public.pm_project_set_editors(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_code  text := btrim(coalesce(p ->> 'code', ''));
  v_list  text[];
  v_row   public.pm_projects;
begin
  if coalesce(p ->> 'role', '') <> 'manager' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if v_code = '' or jsonb_typeof(coalesce(p -> 'editors', '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select coalesce(array_agg(distinct e) filter (where e <> ''), '{}') into v_list
    from (select lower(btrim(x)) as e from jsonb_array_elements_text(coalesce(p -> 'editors', '[]'::jsonb)) as x) as s;
  perform set_config('pm.actor', v_actor, true);
  perform public.pm__ensure_project(v_code, v_actor);
  update public.pm_projects as x set editors = v_list, updated_by = v_actor
   where x.code = v_code
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'editors', to_jsonb(v_row.editors));
end;
$$;

-- p: { actor, code?, task_id? } → boolean
-- 給了 code：要是這個專案的可編輯者；給了既有任務的 id：也要是那個任務「目前所在專案」的可編輯者
-- （兩個都要過，避免拿自己能編輯的專案代碼去改別的專案的任務）
create or replace function public.pm_project_can_edit(p jsonb)
returns boolean
language sql
stable
set search_path = ''
as $$
  with q as (
    select lower(btrim(coalesce(p ->> 'actor', ''))) as who,
           nullif(btrim(coalesce(p ->> 'code', '')), '') as code,
           (select t.project_code from public.pm_tasks as t where t.id = p ->> 'task_id') as task_code
  )
  select (q.code is not null or q.task_code is not null)
     and (q.code is null or exists (select 1 from public.pm_projects as x where x.code = q.code and q.who = any(x.editors)))
     and (q.task_code is null or exists (select 1 from public.pm_projects as x where x.code = q.task_code and q.who = any(x.editors)))
    from q;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('pm_project_set_editors', 'pm_project_can_edit')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
