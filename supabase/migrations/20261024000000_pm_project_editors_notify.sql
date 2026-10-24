-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：「可編輯的人」補兩件事
-- 必須先執行過 20261022000000_pm_project_editors.sql。可以重複執行。
--
--   1. 被加進「可編輯的人」會收到通知（type = 'editor'，APP 內通知＋手機推播）
--   2. pm_data：可編輯的人看得到那個專案「全部」的任務（原本只看得到指派給自己的，
--      專案沒有指派給他的任務時，清單是空的、首頁也不會列出這個專案）
-- ═════════════════════════════════════════════════════════════════════

-- 通知類型多一種 editor
alter table public.pm_notifications drop constraint if exists pm_notifications_type_check;
alter table public.pm_notifications add constraint pm_notifications_type_check
  check (type in ('assigned', 'updated', 'removed', 'deleted', 'done', 'ack', 'reopened', 'editor'));

-- p: { actor, actor_name, role, code, editors: [email…], title, body } → { status, editors, notify }
-- 新加進來的人（不含自己）各寫一則通知，回傳給 API 送手機推播
create or replace function public.pm_project_set_editors(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor  text := public.pm__actor(p);
  v_code   text := btrim(coalesce(p ->> 'code', ''));
  v_list   text[];
  v_old    text[];
  v_row    public.pm_projects;
  v_notify jsonb;
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
  select coalesce(x.editors, '{}') into v_old from public.pm_projects as x where x.code = v_code;
  update public.pm_projects as x set editors = v_list, updated_by = v_actor
   where x.code = v_code
  returning * into v_row;

  with added as (
    select e from unnest(v_list) as e
     where not (e = any(coalesce(v_old, '{}'))) and e <> v_actor
  ), ins as (
    insert into public.pm_notifications (recipient, type, project_code, title, body, actor, actor_name)
    select a.e, 'editor', v_code,
           coalesce(nullif(p ->> 'title', ''), '你可以編輯專案 ' || v_code || ' 了'),
           nullif(p ->> 'body', ''),
           v_actor, nullif(p ->> 'actor_name', '')
      from added as a
    returning recipient, type, task_id, project_code, title, body
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_notify from ins;

  return jsonb_build_object('status', 'ok', 'editors', to_jsonb(v_row.editors), 'notify', v_notify);
end;
$$;

-- 可編輯的人看得到那個專案的全部任務
create or replace function public.pm_data(p jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_manager boolean := coalesce(p ->> 'role', 'member') = 'manager';
begin
  return jsonb_build_object(
    'projects', (select coalesce(jsonb_agg(to_jsonb(x) order by x.code), '[]'::jsonb) from public.pm_projects as x),
    'tasks', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.project_code, t.sort_order, t.created_at), '[]'::jsonb)
        from public.pm_tasks as t
       where v_manager
          or t.assignee_email = v_actor
          or v_actor = any(t.co_assignees)
          or exists (select 1 from public.pm_projects as x where x.code = t.project_code and v_actor = any(x.editors))
    ),
    'unread', (select count(*) from public.pm_notifications as n where n.recipient = v_actor and n.read_at is null),
    'photo_counts', (
      select coalesce(jsonb_object_agg(s.project_code, s.n), '{}'::jsonb)
        from (select ph.project_code, count(*) as n from public.pm_photos as ph group by ph.project_code) as s
    )
  );
end;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('pm_project_set_editors', 'pm_data')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
