-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：專案的「可閱讀的人」
-- 必須先執行過 20261022000000_pm_project_editors.sql。可以重複執行。
-- （已包含 20261024000000_pm_project_editors_notify.sql 的內容，沒跑過那份也沒關係）
--
--   pm_projects.viewers      可閱讀的人（email 陣列）：看得到這個專案全部的任務、甘特圖，但不能改
--   pm_project_set_viewers   設定可閱讀的人（管理者）；新加進來的人收到通知（type = 'viewer'）
--   pm_project_set_editors   同上，可編輯的人（type = 'editor'）
--   pm_data                  一般成員看得到：指派給自己的任務＋自己可編輯／可閱讀的專案的全部任務
-- ═════════════════════════════════════════════════════════════════════

alter table public.pm_projects add column if not exists viewers text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pm_projects_viewers_chk') then
    alter table public.pm_projects add constraint pm_projects_viewers_chk check (coalesce(cardinality(viewers), 0) <= 50);
  end if;
end $$;

-- 通知類型：editor（可以編輯了）、viewer（可以查看了）
alter table public.pm_notifications drop constraint if exists pm_notifications_type_check;
alter table public.pm_notifications add constraint pm_notifications_type_check
  check (type in ('assigned', 'updated', 'removed', 'deleted', 'done', 'ack', 'reopened', 'editor', 'viewer'));

-- 共用：把名單存進 editors 或 viewers，新加進來的人（不含自己）各寫一則通知
-- p: { actor, actor_name, role, code, list: [email…], title, body }
create or replace function public.pm__project_set_people(p jsonb, v_kind text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor  text := public.pm__actor(p);
  v_code   text := btrim(coalesce(p ->> 'code', ''));
  v_list   text[];
  v_old    text[];
  v_new    text[];
  v_notify jsonb;
begin
  if coalesce(p ->> 'role', '') <> 'manager' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if v_code = '' or jsonb_typeof(coalesce(p -> 'list', '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  select coalesce(array_agg(distinct e) filter (where e <> ''), '{}') into v_list
    from (select lower(btrim(x)) as e from jsonb_array_elements_text(coalesce(p -> 'list', '[]'::jsonb)) as x) as s;
  perform set_config('pm.actor', v_actor, true);
  perform public.pm__ensure_project(v_code, v_actor);

  if v_kind = 'editor' then
    select coalesce(x.editors, '{}') into v_old from public.pm_projects as x where x.code = v_code;
    update public.pm_projects as x set editors = v_list, updated_by = v_actor where x.code = v_code returning x.editors into v_new;
  else
    select coalesce(x.viewers, '{}') into v_old from public.pm_projects as x where x.code = v_code;
    update public.pm_projects as x set viewers = v_list, updated_by = v_actor where x.code = v_code returning x.viewers into v_new;
  end if;

  with added as (
    select e from unnest(v_list) as e
     where not (e = any(coalesce(v_old, '{}'))) and e <> v_actor
  ), ins as (
    insert into public.pm_notifications (recipient, type, project_code, title, body, actor, actor_name)
    select a.e, v_kind, v_code,
           coalesce(nullif(p ->> 'title', ''), '專案 ' || v_code),
           nullif(p ->> 'body', ''),
           v_actor, nullif(p ->> 'actor_name', '')
      from added as a
    returning recipient, type, task_id, project_code, title, body
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_notify from ins;

  return jsonb_build_object('status', 'ok', 'list', to_jsonb(v_new), 'notify', v_notify);
end;
$$;

-- p: { actor, actor_name, role, code, editors: [email…], title, body } → { status, editors, notify }
create or replace function public.pm_project_set_editors(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r jsonb;
begin
  r := public.pm__project_set_people(p || jsonb_build_object('list', coalesce(p -> 'editors', '[]'::jsonb)), 'editor');
  return jsonb_build_object('status', r -> 'status', 'editors', r -> 'list', 'notify', coalesce(r -> 'notify', '[]'::jsonb));
end;
$$;

-- p: { actor, actor_name, role, code, viewers: [email…], title, body } → { status, viewers, notify }
create or replace function public.pm_project_set_viewers(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  r jsonb;
begin
  r := public.pm__project_set_people(p || jsonb_build_object('list', coalesce(p -> 'viewers', '[]'::jsonb)), 'viewer');
  return jsonb_build_object('status', r -> 'status', 'viewers', r -> 'list', 'notify', coalesce(r -> 'notify', '[]'::jsonb));
end;
$$;

-- 一般成員：指派給自己的任務＋自己可編輯／可閱讀的專案的全部任務
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
          or exists (
            select 1 from public.pm_projects as x
             where x.code = t.project_code and (v_actor = any(x.editors) or v_actor = any(x.viewers))
          )
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
     where n.nspname = 'public'
       and p.proname in ('pm__project_set_people', 'pm_project_set_editors', 'pm_project_set_viewers', 'pm_data')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
