-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：一個任務指派給多人
--
-- 目標專案：APP 自己的 Supabase 專案（同 20260928000000_pm_schema.sql）。
-- 用法：Supabase → SQL Editor → 整段貼上 → Run。可以重複執行。
--       必須先執行過 20260928000000_pm_schema.sql、20261014000000_pm_goals.sql、20261017000000_pm_task_tree.sql。
--
-- 做法：保留原本的 assignee_email 當「主要負責人」（通知、收到回條、改派都照舊），
--       另加 co_assignees（協作者 email 陣列）。
--   pm_tasks.co_assignees  協作者
--   pm_data                member 也看得到自己是協作者的任務
--   pm_task_save           協作者可以更新狀態、進度、備註（和主要負責人一樣）
--   pm_task_mark           協作者也可以按「收到」
--   pm_task_set_extra      多了 co_assignees；新加入／被移除的協作者會收到通知
-- ═════════════════════════════════════════════════════════════════════


-- ───────────────────────── 1. 欄位 ─────────────────────────

alter table public.pm_tasks
  add column if not exists co_assignees text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pm_tasks_co_assignees_chk') then
    alter table public.pm_tasks add constraint pm_tasks_co_assignees_chk check (coalesce(cardinality(co_assignees), 0) <= 20);
  end if;
end $$;

create index if not exists pm_tasks_co_assignees_idx on public.pm_tasks using gin (co_assignees);

-- pm_task_save 新增時以 jsonb_populate_record 建整列，沒帶到的欄位會是 null → 補預設值
create or replace function public.pm_tasks_meta_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.meta := coalesce(new.meta, '{}'::jsonb);
  new.co_assignees := coalesce(new.co_assignees, '{}');
  return new;
end;
$$;

drop trigger if exists pm_tasks_meta_default on public.pm_tasks;
create trigger pm_tasks_meta_default before insert or update on public.pm_tasks
  for each row execute function public.pm_tasks_meta_default();


-- ───────────────────────── 2. 讀取 ─────────────────────────

-- 首頁資料：專案、任務（manager 全部；member 是主要負責人或協作者的）、未讀通知數、照片數
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
       where v_manager or t.assignee_email = v_actor or v_actor = any(t.co_assignees)
    ),
    'unread', (select count(*) from public.pm_notifications as n where n.recipient = v_actor and n.read_at is null),
    'photo_counts', (
      select coalesce(jsonb_object_agg(s.project_code, s.n), '{}'::jsonb)
        from (select ph.project_code, count(*) as n from public.pm_photos as ph group by ph.project_code) as s
    )
  );
end;
$$;


-- ───────────────────────── 3. 儲存（只改了 member 的權限判斷） ─────────────────────────

create or replace function public.pm_task_save(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor   text := public.pm__actor(p);
  v_name    text := coalesce(nullif(btrim(p ->> 'actor_name'), ''), split_part(public.pm__actor(p), '@', 1));
  v_manager boolean := coalesce(p ->> 'role', 'member') = 'manager';
  v_in      jsonb := coalesce(p -> 'task', '{}'::jsonb);
  v_id      text := nullif(btrim(coalesce(v_in ->> 'id', '')), '');
  v_base    integer := nullif(p ->> 'base_version', '')::integer;
  v_pname   text := coalesce(nullif(btrim(p ->> 'project_name'), ''), '');
  v_patch   jsonb;
  v_old     public.pm_tasks;
  v_new     public.pm_tasks;
  v_found   boolean;
  v_notify  jsonb := '[]'::jsonb;
  v_n       jsonb;
  v_what    text;
begin
  if v_id is null then
    raise exception 'pm_task_save: task.id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_in) <> 'object' then
    raise exception 'pm_task_save: task must be an object' using errcode = '22023';
  end if;
  perform set_config('pm.actor', v_actor, true);

  -- 系統欄位一律由這裡決定
  v_patch := v_in - array['id','version','created_at','created_by','updated_at','updated_by',
                          'assigned_by','assigned_by_name','assigned_at','seen_at','ack_at','done_at','done_by'];

  select * into v_old from public.pm_tasks as t where t.id = v_id for update;
  v_found := found;

  if not v_manager then
    if v_found then
      -- 主要負責人或協作者都可以更新（協作者同樣只能改狀態、進度、備註）
      if v_old.assignee_email is distinct from v_actor and not (v_actor = any(coalesce(v_old.co_assignees, '{}'))) then
        return jsonb_build_object('status', 'forbidden');
      end if;
      if v_old.created_by is distinct from v_actor then
        -- 別人指派的任務：只能改狀態、進度、備註
        select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_patch
          from jsonb_each(v_patch) as e where e.key in ('status','progress','note');
      else
        -- 自己建給自己的待辦：什麼都能改，但不能指派給別人
        v_patch := v_patch - array['assignee_email','assignee_name'];
      end if;
    else
      -- 自己的待辦：一律指派給自己
      v_patch := v_patch || jsonb_build_object('assignee_email', v_actor, 'assignee_name', v_name);
    end if;
  end if;

  if v_found then
    if v_base is not null and v_base <> v_old.version then
      if to_jsonb(v_old) @> v_patch then
        return jsonb_build_object('status', 'unchanged', 'task', to_jsonb(v_old), 'notify', '[]'::jsonb);
      end if;
      return jsonb_build_object('status', 'conflict', 'task', to_jsonb(v_old), 'notify', '[]'::jsonb);
    end if;
    v_new := jsonb_populate_record(v_old, v_patch);
  else
    if v_base is not null and v_base > 0 then
      return jsonb_build_object('status', 'not_found', 'notify', '[]'::jsonb);
    end if;
    v_new := jsonb_populate_record(null::public.pm_tasks, v_patch || jsonb_build_object('id', v_id));
    v_new.created_by := v_actor;
    v_new.created_at := now();
    v_new.updated_at := now();
    v_new.status := coalesce(v_new.status, 'todo');
    v_new.progress := coalesce(v_new.progress, 0);
    v_new.flagged := coalesce(v_new.flagged, false);
    v_new.version := 1;
    perform public.pm__ensure_project(v_new.project_code, v_actor);
    if v_new.sort_order is null then
      select coalesce(max(t.sort_order) + 1, 0) into v_new.sort_order
        from public.pm_tasks as t where t.project_code = v_new.project_code;
    end if;
  end if;

  -- 清理
  v_new.title := btrim(coalesce(v_new.title, ''));
  v_new.note := nullif(btrim(coalesce(v_new.note, '')), '');
  v_new.kind := nullif(nullif(btrim(coalesce(v_new.kind, '')), ''), '施工');
  v_new.assignee_email := nullif(lower(btrim(coalesce(v_new.assignee_email, ''))), '');
  if v_new.assignee_email is null then
    v_new.assignee_name := null;
  else
    v_new.assignee_name := coalesce(nullif(btrim(coalesce(v_new.assignee_name, '')), ''), split_part(v_new.assignee_email, '@', 1));
  end if;
  v_new.progress := greatest(0, least(100, coalesce(v_new.progress, 0)));

  -- 狀態與進度保持一致
  if v_new.status = 'done' then
    v_new.progress := 100;
    if not v_found or v_old.status <> 'done' then
      v_new.done_at := now();
      v_new.done_by := v_actor;
    end if;
  elsif v_found and v_old.status = 'done' then
    -- 重新打開
    v_new.done_at := null;
    v_new.done_by := null;
    if v_new.progress >= 100 then v_new.progress := 0; end if;
    if v_new.status = 'todo' and v_new.progress > 0 then v_new.status := 'doing'; end if;
  elsif v_new.progress >= 100 then
    v_new.status := 'done';
    v_new.done_at := now();
    v_new.done_by := v_actor;
  elsif v_new.progress > 0 and v_new.status = 'todo' then
    v_new.status := 'doing';
  end if;

  -- 指派：換人時重設「已讀／收到」
  if v_new.assignee_email is distinct from (case when v_found then v_old.assignee_email end) then
    if v_new.assignee_email is null then
      v_new.assigned_by := null; v_new.assigned_by_name := null; v_new.assigned_at := null;
      v_new.seen_at := null; v_new.ack_at := null;
    else
      v_new.assigned_by := v_actor; v_new.assigned_by_name := v_name; v_new.assigned_at := now();
      if v_new.assignee_email = v_actor then
        v_new.seen_at := now(); v_new.ack_at := now();
      else
        v_new.seen_at := null; v_new.ack_at := null;
      end if;
    end if;
  end if;

  if v_found then
    update public.pm_tasks as t set
      project_code = v_new.project_code, title = v_new.title, kind = v_new.kind, status = v_new.status,
      progress = v_new.progress, flagged = coalesce(v_new.flagged, false),
      assignee_email = v_new.assignee_email, assignee_name = v_new.assignee_name,
      start_on = v_new.start_on, due_on = v_new.due_on, note = v_new.note,
      sort_order = coalesce(v_new.sort_order, t.sort_order),
      assigned_by = v_new.assigned_by, assigned_by_name = v_new.assigned_by_name, assigned_at = v_new.assigned_at,
      seen_at = v_new.seen_at, ack_at = v_new.ack_at, done_at = v_new.done_at, done_by = v_new.done_by,
      updated_by = v_actor
    where t.id = v_id
    returning * into v_new;
    if v_new.version = v_old.version and to_jsonb(v_new) - array['updated_at','updated_by'] = to_jsonb(v_old) - array['updated_at','updated_by'] then
      return jsonb_build_object('status', 'unchanged', 'task', to_jsonb(v_new), 'notify', '[]'::jsonb);
    end if;
  else
    v_new.updated_by := v_actor;
    insert into public.pm_tasks select (v_new).* returning * into v_new;
  end if;

  -- ── 通知 ──
  if v_pname = '' then
    select coalesce(x.name, x.code) into v_pname from public.pm_projects as x where x.code = v_new.project_code;
  end if;

  if v_new.assignee_email is distinct from (case when v_found then v_old.assignee_email end) then
    if v_new.assignee_email is not null then
      v_n := public.pm__notify(v_new.assignee_email, 'assigned', v_new, v_actor, v_name,
               '新任務：' || v_new.title,
               v_name || ' 指派給你・' || v_pname
                 || coalesce('・期限 ' || public.pm__md(v_new.due_on), ''));
      if v_n is not null then v_notify := v_notify || jsonb_build_array(v_n); end if;
    end if;
    if v_found and v_old.assignee_email is not null then
      v_n := public.pm__notify(v_old.assignee_email, 'removed', v_new, v_actor, v_name,
               '任務已改派：' || v_new.title,
               coalesce(v_name || ' 改派給 ' || v_new.assignee_name, v_name || ' 取消了你的指派'));
      if v_n is not null then v_notify := v_notify || jsonb_build_array(v_n); end if;
    end if;
  elsif v_found and v_new.assignee_email is not null then
    -- 同一個人，但內容變了
    v_what := null;
    if v_new.due_on is distinct from v_old.due_on then
      v_what := coalesce('期限改為 ' || public.pm__md(v_new.due_on), '取消了期限');
    elsif v_new.start_on is distinct from v_old.start_on then
      v_what := coalesce('開始日改為 ' || public.pm__md(v_new.start_on), '取消了開始日');
    elsif v_new.title is distinct from v_old.title then
      v_what := '任務名稱改了';
    elsif v_new.project_code is distinct from v_old.project_code then
      v_what := '換到專案 ' || v_pname;
    elsif v_new.note is distinct from v_old.note and v_actor <> v_new.assignee_email then
      v_what := '更新了備註';
    elsif (v_new.status = 'done') is distinct from (v_old.status = 'done') and v_actor <> v_new.assignee_email then
      v_what := case when v_new.status = 'done' then '標記為完成' else '重新打開了任務' end;
    end if;
    if v_what is not null then
      v_n := public.pm__notify(v_new.assignee_email, 'updated', v_new, v_actor, v_name,
               '任務更新：' || v_new.title, v_name || ' ' || v_what);
      if v_n is not null then v_notify := v_notify || jsonb_build_array(v_n); end if;
    end if;
  end if;

  -- 被指派的人完成／重開 → 通知指派的人
  if v_found and v_new.assigned_by is not null and v_actor = v_new.assignee_email
     and (v_new.status = 'done') is distinct from (v_old.status = 'done') then
    v_n := public.pm__notify(v_new.assigned_by, case when v_new.status = 'done' then 'done' else 'reopened' end,
             v_new, v_actor, v_name,
             case when v_new.status = 'done' then '已完成：' else '重新打開：' end || v_new.title,
             v_name || '・' || v_pname);
    if v_n is not null then v_notify := v_notify || jsonb_build_array(v_n); end if;
  end if;

  return jsonb_build_object(
    'status', case when v_found then 'ok' else 'created' end,
    'task', to_jsonb(v_new),
    'notify', v_notify);
end;
$$;


-- ───────────────────────── 4. 收到 ─────────────────────────

-- p: { actor, actor_name, id, what: 'seen'|'ack' } → { status, task, notify }
-- seen_at／ack_at 只有一組：誰先打開／先按收到就記誰（給指派的人看「有人接手了」）
create or replace function public.pm_task_mark(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_name  text := coalesce(nullif(btrim(p ->> 'actor_name'), ''), split_part(public.pm__actor(p), '@', 1));
  v_t     public.pm_tasks;
  v_n     jsonb;
  v_notify jsonb := '[]'::jsonb;
begin
  perform set_config('pm.actor', v_actor, true);
  select * into v_t from public.pm_tasks as t where t.id = p ->> 'id' for update;
  if not found then
    return jsonb_build_object('status', 'not_found', 'notify', '[]'::jsonb);
  end if;
  if v_t.assignee_email is distinct from v_actor and not (v_actor = any(v_t.co_assignees)) then
    return jsonb_build_object('status', 'forbidden', 'notify', '[]'::jsonb);
  end if;
  if p ->> 'what' = 'ack' then
    if v_t.ack_at is null then
      update public.pm_tasks as t set ack_at = now(), seen_at = coalesce(t.seen_at, now()), updated_by = v_actor
       where t.id = v_t.id returning * into v_t;
      v_n := public.pm__notify(v_t.assigned_by, 'ack', v_t, v_actor, v_name,
               '已收到：' || v_t.title, v_name || ' 確認收到任務');
      if v_n is not null then v_notify := v_notify || jsonb_build_array(v_n); end if;
    end if;
  elsif v_t.seen_at is null then
    update public.pm_tasks as t set seen_at = now(), updated_by = v_actor
     where t.id = v_t.id returning * into v_t;
  end if;
  update public.pm_notifications as n set read_at = now()
   where n.recipient = v_actor and n.task_id = v_t.id and n.read_at is null;
  return jsonb_build_object('status', 'ok', 'task', to_jsonb(v_t), 'notify', v_notify);
end;
$$;


-- ───────────────────────── 5. 上層、標籤、目標、協作者 ─────────────────────────

-- p: { actor, actor_name, role, id, extra: { parent_id?, meta?, goal_id?, co_assignees? } } → { status, task, notify }
create or replace function public.pm_task_set_extra(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor   text := public.pm__actor(p);
  v_name    text := coalesce(nullif(btrim(p ->> 'actor_name'), ''), split_part(public.pm__actor(p), '@', 1));
  v_manager boolean := coalesce(p ->> 'role', 'member') = 'manager';
  v_id      text := nullif(btrim(coalesce(p ->> 'id', '')), '');
  v_in      jsonb := coalesce(p -> 'extra', '{}'::jsonb);
  v_old     public.pm_tasks;
  v_new     public.pm_tasks;
  v_parent  public.pm_tasks;
  v_pid     text;
  v_pname   text;
  v_e       text;
  v_n       jsonb;
  v_notify  jsonb := '[]'::jsonb;
begin
  select * into v_old from public.pm_tasks as t where t.id = v_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found', 'notify', '[]'::jsonb);
  end if;
  if not v_manager and v_old.created_by is distinct from v_actor then
    return jsonb_build_object('status', 'forbidden', 'task', to_jsonb(v_old), 'notify', '[]'::jsonb);
  end if;
  perform set_config('pm.actor', v_actor, true);

  v_new := v_old;

  if v_in ? 'parent_id' then
    v_pid := nullif(btrim(coalesce(v_in ->> 'parent_id', '')), '');
    if v_pid is not null then
      select * into v_parent from public.pm_tasks as t where t.id = v_pid;
      if not found or v_parent.project_code <> v_old.project_code or v_parent.parent_id is not null or v_pid = v_id then
        return jsonb_build_object('status', 'invalid', 'task', to_jsonb(v_old), 'notify', '[]'::jsonb);
      end if;
      if exists (select 1 from public.pm_tasks as c where c.parent_id = v_id) then
        return jsonb_build_object('status', 'invalid', 'task', to_jsonb(v_old), 'notify', '[]'::jsonb);
      end if;
    end if;
    v_new.parent_id := v_pid;
  end if;

  if v_in ? 'meta' then
    if jsonb_typeof(v_in -> 'meta') <> 'object' then
      return jsonb_build_object('status', 'invalid', 'task', to_jsonb(v_old), 'notify', '[]'::jsonb);
    end if;
    v_new.meta := v_in -> 'meta';
  end if;

  if v_in ? 'goal_id' then
    v_new.goal_id := nullif(btrim(coalesce(v_in ->> 'goal_id', '')), '');
  end if;

  if v_in ? 'co_assignees' then
    if jsonb_typeof(v_in -> 'co_assignees') not in ('array', 'null') then
      return jsonb_build_object('status', 'invalid', 'task', to_jsonb(v_old), 'notify', '[]'::jsonb);
    end if;
    -- 去重、轉小寫、拿掉主要負責人本人
    select coalesce(array_agg(distinct e) filter (where e <> '' and e is distinct from v_old.assignee_email), '{}')
      into v_new.co_assignees
      from (select lower(btrim(x)) as e from jsonb_array_elements_text(coalesce(v_in -> 'co_assignees', '[]'::jsonb)) as x) as s;
    if cardinality(v_new.co_assignees) > 20 then
      return jsonb_build_object('status', 'invalid', 'task', to_jsonb(v_old), 'notify', '[]'::jsonb);
    end if;
  end if;

  if v_new.parent_id is not distinct from v_old.parent_id
     and v_new.meta is not distinct from v_old.meta
     and v_new.goal_id is not distinct from v_old.goal_id
     and v_new.co_assignees is not distinct from v_old.co_assignees then
    return jsonb_build_object('status', 'unchanged', 'task', to_jsonb(v_old), 'notify', '[]'::jsonb);
  end if;

  update public.pm_tasks as t set
    parent_id = v_new.parent_id, meta = v_new.meta, goal_id = v_new.goal_id,
    co_assignees = v_new.co_assignees, updated_by = v_actor
  where t.id = v_id
  returning * into v_new;

  -- 協作者異動：新加入的收到「新任務」，被移除的收到「已移除」
  if v_new.co_assignees is distinct from v_old.co_assignees then
    select coalesce(x.name, '') into v_pname from public.pm_projects as x where x.code = v_new.project_code;
    for v_e in select unnest(v_new.co_assignees) except select unnest(v_old.co_assignees) loop
      v_n := public.pm__notify(v_e, 'assigned', v_new, v_actor, v_name,
               '新任務：' || v_new.title,
               v_name || ' 邀你一起負責・' || coalesce(nullif(v_pname, ''), v_new.project_code)
                 || coalesce('・期限 ' || public.pm__md(v_new.due_on), ''));
      if v_n is not null then v_notify := v_notify || jsonb_build_array(v_n); end if;
    end loop;
    for v_e in select unnest(v_old.co_assignees) except select unnest(v_new.co_assignees) loop
      v_n := public.pm__notify(v_e, 'removed', v_new, v_actor, v_name,
               '已移除協作：' || v_new.title, v_name || ' 把你從這個任務移除');
      if v_n is not null then v_notify := v_notify || jsonb_build_array(v_n); end if;
    end loop;
  end if;

  return jsonb_build_object('status', 'ok', 'task', to_jsonb(v_new), 'notify', v_notify);
end;
$$;


-- ───────────────────────── 6. 權限 ─────────────────────────

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('pm_data', 'pm_task_save', 'pm_task_mark', 'pm_task_set_extra')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
