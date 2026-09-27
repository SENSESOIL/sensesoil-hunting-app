-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：專案／任務／工程照  schema v2
--
-- 目標專案：APP 自己的 Supabase 專案（Vercel 的 NEXT_PUBLIC_SUPABASE_URL，
--           裡面有 hunting_tasks 那個）。
--           ⚠ 不是組織圖專案 rynhfvyoaswynyvghyzi（那邊的 org_doc 是 anon 可讀）。
-- 用法：Supabase → SQL Editor → 整段貼上 → Run。可以重複執行。
--       若曾經執行過 v1（20260927000000_pm_tables.sql），這份會自動補欄位、清掉舊函式。
--
-- 安全模型：
--   所有 pm_* 表都開 RLS、不建任何 policy，並撤銷 anon / authenticated 的權限
--   → 瀏覽器就算拿到公開的 anon key，也讀不到、寫不進（合約金額、業主地址都在這裡）。
--   只有伺服器（Next.js API，持有 SUPABASE_SECRET_KEY）能呼叫下面的 pm_* 函式；
--   API 先用權限表確認身分，再把 actor（email）與 role（manager / member）傳進來，
--   函式裡再檢查一次：member 只能改「指派給自己」的任務的狀態、進度、備註。
--
-- 單位：金額 = 新台幣「元」整數（bigint），UI 換算成「萬」。
--       日期 = date（不含時區）。進度 = 0–100 整數。
-- 所有函式都是 fn(p jsonb) returns jsonb，欄位用 snake_case。
-- 之後的欄位變更請新增 migration 檔。
-- ═════════════════════════════════════════════════════════════════════


-- ───────────────────────── 0. 清掉 v1 的舊函式（v1 沒被用過） ─────────────────────────

drop function if exists public.pm_save_project(text, integer, jsonb, text, uuid);
drop function if exists public.pm_save_work_items(text, integer, jsonb, text, uuid);
drop function if exists public.pm_items_json(text);

do $$
declare
  t text;
  v_empty boolean;
begin
  -- v1 的工項表與冪等表：沒有資料才移除（有資料就留著，不冒險）
  foreach t in array array['pm_work_items', 'pm_mutations'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select not exists (select 1 from public.%I)', t) into v_empty;
      if v_empty then
        execute format('drop table public.%I', t);
      end if;
    end if;
  end loop;
end $$;


-- ───────────────────────── 1. 資料表 ─────────────────────────

-- 專案：代碼對應 拾壤CRM「專案CRM」；也可以直接在 APP 新建（name 有值）
create table if not exists public.pm_projects (
  code           text        primary key,
  created_at     timestamptz not null default now(),
  created_by     text        not null default 'system',
  updated_at     timestamptz not null default now(),
  updated_by     text        not null default 'system',
  version        integer     not null default 1
);

alter table public.pm_projects
  add column if not exists name            text,         -- APP 新建的專案名稱（CRM 有的以 CRM 為準）
  add column if not exists company         text,         -- 單位
  add column if not exists stage           text,
  add column if not exists category        text,
  add column if not exists site            text,         -- 工地地址
  add column if not exists client          text,         -- 業主
  add column if not exists manager         text,         -- 工地主任（姓名）
  add column if not exists signed_on       date,
  add column if not exists start_on        date,
  add column if not exists due_on          date,
  add column if not exists done_on         date,
  add column if not exists contract        bigint,       -- 合約金額（元）
  add column if not exists variation       bigint,       -- 追加減（元，可為負）
  add column if not exists billed          bigint,       -- 累計已請款（元）
  add column if not exists collected       bigint,       -- 累計已收款（元）
  add column if not exists progress        smallint,     -- 手填的實際進度；空白時依任務推算
  add column if not exists risk            text,
  add column if not exists note            text,         -- 近況
  add column if not exists drive_folder_id text,         -- Google Drive 專案資料夾（工程照放在它底下）
  add column if not exists archived        boolean     not null default false;

-- v1 的 items_version 已不再使用
alter table public.pm_projects drop column if exists items_version;
alter table public.pm_projects drop column if exists members;
alter table public.pm_projects drop constraint if exists pm_projects_version_chk;
alter table public.pm_projects drop constraint if exists pm_projects_text_len_chk;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pm_projects_v2_chk') then
    alter table public.pm_projects add constraint pm_projects_v2_chk check (
          code = btrim(code) and char_length(code) between 1 and 32
      and (stage    is null or stage    in ('洽談','報價','簽約','施工中','驗收','保固','結案','暫停'))
      and (risk     is null or risk     in ('正常','注意','異常'))
      and (progress is null or progress between 0 and 100)
      and (due_on   is null or start_on is null or due_on  >= start_on)
      and (done_on  is null or start_on is null or done_on >= start_on)
      and (contract  is null or contract  between 0 and 100000000000)
      and (variation is null or variation between -100000000000 and 100000000000)
      and (billed    is null or billed    between 0 and 100000000000)
      and (collected is null or collected between 0 and 100000000000)
      and coalesce(char_length(name), 0)    <= 80
      and coalesce(char_length(company), 0) <= 40
      and coalesce(char_length(site), 0)    <= 200
      and coalesce(char_length(client), 0)  <= 100
      and coalesce(char_length(manager), 0) <= 50
      and coalesce(char_length(note), 0)    <= 1000
      and version >= 1
    );
  end if;
end $$;

-- 任務（＝工項＝排程上的一條）
create table if not exists public.pm_tasks (
  id              text        primary key,                 -- 前端產生（t-3f9a1c2b7d0e），離線建立也不用換 id
  project_code    text        not null references public.pm_projects(code) on update cascade on delete cascade,
  title           text        not null,
  kind            text,                                    -- 施工（null）／等待／檢驗／里程碑
  status          text        not null default 'todo',     -- todo 待辦 / doing 進行中 / done 完成
  progress        smallint    not null default 0,
  flagged         boolean     not null default false,      -- 重要
  assignee_email  text,
  assignee_name   text,
  start_on        date,
  due_on          date,
  note            text,
  sort_order      integer     not null default 0,
  assigned_by     text,                                    -- 誰指派的（email）
  assigned_by_name text,
  assigned_at     timestamptz,
  seen_at         timestamptz,                             -- 被指派的人第一次打開
  ack_at          timestamptz,                             -- 被指派的人按「收到」
  done_at         timestamptz,
  done_by         text,
  version         integer     not null default 1,
  created_at      timestamptz not null default now(),
  created_by      text        not null default 'system',
  updated_at      timestamptz not null default now(),
  updated_by      text        not null default 'system',
  constraint pm_tasks_chk check (
        char_length(id) between 1 and 64
    and btrim(title) <> '' and char_length(title) <= 80
    and (kind is null or kind in ('等待','檢驗','里程碑'))
    and status in ('todo','doing','done')
    and progress between 0 and 100
    and (due_on is null or start_on is null or due_on >= start_on)
    and coalesce(char_length(note), 0) <= 2000
    and coalesce(char_length(assignee_email), 0) <= 120
    and sort_order >= 0
  )
);

-- 通知（APP 內的鈴鐺＋手機推播）
create table if not exists public.pm_notifications (
  id            bigint      generated always as identity primary key,
  recipient     text        not null,                      -- email
  type          text        not null check (type in ('assigned','updated','removed','deleted','done','ack','reopened')),
  task_id       text,
  project_code  text,
  title         text        not null,
  body          text,
  actor         text,
  actor_name    text,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

-- 手機推播訂閱（Web Push；iPhone 需先「加入主畫面」）
create table if not exists public.pm_push_subscriptions (
  endpoint      text        primary key,
  email         text        not null,
  p256dh        text        not null,
  auth          text        not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_ok_at    timestamptz
);

-- 工程照（檔案本身在 Google Drive；這裡存索引與小縮圖）
create table if not exists public.pm_photos (
  id               text        primary key,
  project_code     text        not null references public.pm_projects(code) on update cascade on delete cascade,
  task_id          text,
  drive_file_id    text,
  drive_url        text,
  file_name        text        not null,
  caption          text,
  taken_on         date,
  uploaded_by      text        not null,
  uploaded_by_name text,
  thumb            text,                                   -- data:image/jpeg;base64,…（約 10KB）
  width            integer,
  height           integer,
  bytes            integer,
  created_at       timestamptz not null default now(),
  constraint pm_photos_chk check (
        char_length(file_name) <= 200
    and coalesce(char_length(caption), 0) <= 500
    and coalesce(char_length(thumb), 0) <= 60000
  )
);

-- 變更紀錄：只准 trigger 寫
create table if not exists public.pm_change_log (
  id            bigint      generated always as identity primary key,
  changed_at    timestamptz not null default now(),
  actor         text        not null,
  table_name    text        not null,
  op            text        not null check (op in ('INSERT','UPDATE','DELETE')),
  project_code  text        not null,
  row_key       text        not null,
  diff          jsonb       not null
);
alter table public.pm_change_log drop constraint if exists pm_change_log_table_name_check;
alter table public.pm_change_log drop column if exists mutation_id;


-- ───────────────────────── 2. 索引 ─────────────────────────

create index if not exists pm_projects_stage_idx        on public.pm_projects (stage);
create index if not exists pm_tasks_project_idx          on public.pm_tasks (project_code, sort_order);
create index if not exists pm_tasks_assignee_idx         on public.pm_tasks (assignee_email, status);
create index if not exists pm_tasks_due_idx              on public.pm_tasks (due_on) where status <> 'done';
create index if not exists pm_notifications_inbox_idx    on public.pm_notifications (recipient, created_at desc);
create index if not exists pm_notifications_unread_idx   on public.pm_notifications (recipient) where read_at is null;
create index if not exists pm_push_email_idx             on public.pm_push_subscriptions (email);
create index if not exists pm_photos_project_idx         on public.pm_photos (project_code, created_at desc);
create index if not exists pm_change_log_project_idx     on public.pm_change_log (project_code, changed_at desc);


-- ───────────────────────── 3. updated_at / version trigger ─────────────────────────

create or replace function public.pm_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- 這些欄位變動不算「內容改了」：不加版本號，也不會讓同時編輯的人撞衝突
  v_noise constant text[] := array['version','created_at','created_by','updated_at','updated_by','sort_order','seen_at','ack_at'];
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.version := old.version;
  if (to_jsonb(new) - v_noise) is distinct from (to_jsonb(old) - v_noise) then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists pm_projects_touch on public.pm_projects;
create trigger pm_projects_touch before update on public.pm_projects
  for each row execute function public.pm_touch();
drop trigger if exists pm_tasks_touch on public.pm_tasks;
create trigger pm_tasks_touch before update on public.pm_tasks
  for each row execute function public.pm_touch();


-- ───────────────────────── 4. 變更紀錄 trigger ─────────────────────────

create or replace function public.pm_log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old   jsonb := '{}'::jsonb;
  v_new   jsonb := '{}'::jsonb;
  v_noise constant text[] := array['version','created_at','created_by','updated_at','updated_by','sort_order','seen_at','thumb'];
  v_diff  jsonb;
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;

  select coalesce(jsonb_object_agg(k.col, jsonb_build_object('from', v_old -> k.col, 'to', v_new -> k.col)), '{}'::jsonb)
    into v_diff
    from (select jsonb_object_keys(v_old) as col union select jsonb_object_keys(v_new)) as k
   where not (k.col = any (v_noise))
     and coalesce(v_old -> k.col, 'null'::jsonb) is distinct from coalesce(v_new -> k.col, 'null'::jsonb);

  if v_diff = '{}'::jsonb then
    return null;
  end if;

  insert into public.pm_change_log (actor, table_name, op, project_code, row_key, diff)
  values (
    coalesce(nullif(current_setting('pm.actor', true), ''), v_new ->> 'updated_by', 'db:' || session_user),
    tg_table_name,
    tg_op,
    coalesce(v_new ->> 'project_code', v_old ->> 'project_code', v_new ->> 'code', v_old ->> 'code'),
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'code', v_old ->> 'code'),
    v_diff
  );
  return null;
end;
$$;

drop trigger if exists pm_projects_log on public.pm_projects;
create trigger pm_projects_log after insert or update or delete on public.pm_projects
  for each row execute function public.pm_log_change();
drop trigger if exists pm_tasks_log on public.pm_tasks;
create trigger pm_tasks_log after insert or update or delete on public.pm_tasks
  for each row execute function public.pm_log_change();


-- ───────────────────────── 5. 內部小工具 ─────────────────────────

create or replace function public.pm__actor(p jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  a text := lower(btrim(coalesce(p ->> 'actor', '')));
begin
  if a = '' or position('@' in a) = 0 then
    raise exception 'pm: actor (email) is required' using errcode = '22023';
  end if;
  return a;
end;
$$;

create or replace function public.pm__md(d date)
returns text
language sql
immutable
set search_path = ''
as $$ select case when d is null then null else to_char(d, 'FMMM/FMDD') end $$;

-- 建一則通知，回傳這一列（API 用它發推播）
create or replace function public.pm__notify(
  p_recipient text, p_type text, p_task public.pm_tasks,
  p_actor text, p_actor_name text, p_title text, p_body text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v jsonb;
begin
  if p_recipient is null or p_recipient = '' or p_recipient = p_actor then
    return null;
  end if;
  insert into public.pm_notifications (recipient, type, task_id, project_code, title, body, actor, actor_name)
  values (p_recipient, p_type, p_task.id, p_task.project_code, p_title, p_body, p_actor, p_actor_name)
  returning to_jsonb(pm_notifications.*) into v;
  return v;
end;
$$;

-- 專案不存在就建一列空白的（CRM 名冊上的專案第一次有任務時）
create or replace function public.pm__ensure_project(p_code text, p_actor text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_code is null or btrim(p_code) = '' then
    raise exception 'pm: project_code is required' using errcode = '22023';
  end if;
  insert into public.pm_projects (code, created_by, updated_by)
  values (btrim(p_code), p_actor, p_actor)
  on conflict (code) do nothing;
end;
$$;


-- ───────────────────────── 6. 讀取 ─────────────────────────

-- 首頁資料：專案、任務（manager 全部；member 只有指派給自己的）、未讀通知數、照片數
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
       where v_manager or t.assignee_email = v_actor
    ),
    'unread', (select count(*) from public.pm_notifications as n where n.recipient = v_actor and n.read_at is null),
    'photo_counts', (
      select coalesce(jsonb_object_agg(s.project_code, s.n), '{}'::jsonb)
        from (select ph.project_code, count(*) as n from public.pm_photos as ph group by ph.project_code) as s
    )
  );
end;
$$;


-- ───────────────────────── 7. 專案 ─────────────────────────

-- p: { actor, role, code, base_version, patch:{…snake_case…} }
-- 回傳 { status: created|ok|unchanged|conflict|forbidden, project }
create or replace function public.pm_project_save(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_code  text := btrim(coalesce(p ->> 'code', ''));
  v_base  integer := nullif(p ->> 'base_version', '')::integer;
  v_patch jsonb := coalesce(p -> 'patch', '{}'::jsonb)
                   - array['code','version','created_at','created_by','updated_at','updated_by'];
  v_row   public.pm_projects;
  v_new   public.pm_projects;
  v_created boolean := false;
begin
  if coalesce(p ->> 'role', '') <> 'manager' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if v_code = '' then
    raise exception 'pm_project_save: code is required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_patch) <> 'object' then
    raise exception 'pm_project_save: patch must be an object' using errcode = '22023';
  end if;
  perform set_config('pm.actor', v_actor, true);

  select * into v_row from public.pm_projects as x where x.code = v_code for update;
  if not found then
    insert into public.pm_projects (code, created_by, updated_by) values (v_code, v_actor, v_actor)
    returning * into v_row;
    v_created := true;
  elsif v_base is not null and v_base <> v_row.version then
    -- 別人剛改過；如果要改的值已經一樣就當成功（重送）
    if to_jsonb(v_row) @> v_patch then
      return jsonb_build_object('status', 'unchanged', 'project', to_jsonb(v_row));
    end if;
    return jsonb_build_object('status', 'conflict', 'project', to_jsonb(v_row));
  end if;

  v_new := jsonb_populate_record(v_row, v_patch);
  update public.pm_projects as x set
    name = nullif(btrim(v_new.name), ''),
    company = nullif(btrim(v_new.company), ''),
    stage = v_new.stage, category = v_new.category,
    site = nullif(btrim(v_new.site), ''), client = nullif(btrim(v_new.client), ''),
    manager = nullif(btrim(v_new.manager), ''),
    signed_on = v_new.signed_on, start_on = v_new.start_on, due_on = v_new.due_on, done_on = v_new.done_on,
    contract = v_new.contract, variation = v_new.variation, billed = v_new.billed, collected = v_new.collected,
    progress = v_new.progress, risk = v_new.risk, note = nullif(btrim(v_new.note), ''),
    drive_folder_id = nullif(btrim(v_new.drive_folder_id), ''),
    archived = coalesce(v_new.archived, false),
    updated_by = v_actor
  where x.code = v_code
  returning * into v_new;

  return jsonb_build_object(
    'status', case when v_created then 'created' when v_new.version <> v_row.version then 'ok' else 'unchanged' end,
    'project', to_jsonb(v_new));
end;
$$;

-- 上傳照片時自動找到的 Drive 資料夾（任何登入的人上傳都可以回填，只在原本沒有值時寫入）
create or replace function public.pm_project_set_folder(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_code  text := btrim(coalesce(p ->> 'code', ''));
  v_folder text := nullif(btrim(coalesce(p ->> 'folder_id', '')), '');
begin
  if v_folder is null then
    return jsonb_build_object('status', 'unchanged');
  end if;
  perform set_config('pm.actor', v_actor, true);
  perform public.pm__ensure_project(v_code, v_actor);
  update public.pm_projects as x set drive_folder_id = v_folder, updated_by = v_actor
   where x.code = v_code and x.drive_folder_id is null;
  return jsonb_build_object('status', 'ok');
end;
$$;


-- ───────────────────────── 8. 任務 ─────────────────────────

-- p: { actor, actor_name, role, project_name?, base_version?, task:{ id, …snake_case… } }
-- 新增或修改一個任務。指派／改期／完成時自動產生通知。
-- 回傳 { status: created|ok|unchanged|conflict|forbidden|not_found, task, notify:[通知列…] }
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
      if v_old.assignee_email is distinct from v_actor then
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

-- p: { actor, actor_name, role, id } → { status, notify }
create or replace function public.pm_task_delete(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_name  text := coalesce(nullif(btrim(p ->> 'actor_name'), ''), split_part(public.pm__actor(p), '@', 1));
  v_old   public.pm_tasks;
  v_n     jsonb;
  v_notify jsonb := '[]'::jsonb;
begin
  perform set_config('pm.actor', v_actor, true);
  select * into v_old from public.pm_tasks as t where t.id = p ->> 'id' for update;
  if not found then
    return jsonb_build_object('status', 'not_found', 'notify', '[]'::jsonb);
  end if;
  -- member 只能刪自己建給自己的待辦
  if coalesce(p ->> 'role', 'member') <> 'manager'
     and not (v_old.created_by = v_actor and v_old.assignee_email = v_actor) then
    return jsonb_build_object('status', 'forbidden', 'notify', '[]'::jsonb);
  end if;
  delete from public.pm_tasks as t where t.id = v_old.id;
  if v_old.assignee_email is not null and v_old.status <> 'done' then
    v_n := public.pm__notify(v_old.assignee_email, 'deleted', v_old, v_actor, v_name,
             '任務已取消：' || v_old.title, v_name || ' 刪除了這個任務');
    if v_n is not null then v_notify := v_notify || jsonb_build_array(v_n); end if;
  end if;
  return jsonb_build_object('status', 'ok', 'notify', v_notify);
end;
$$;

-- p: { actor, role, ids:[…依新順序…] } → { status }
create or replace function public.pm_task_reorder(p jsonb)
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
  if jsonb_typeof(p -> 'ids') is distinct from 'array' then
    raise exception 'pm_task_reorder: ids must be an array' using errcode = '22023';
  end if;
  perform set_config('pm.actor', v_actor, true);
  update public.pm_tasks as t set sort_order = (e.ord - 1)::integer
    from jsonb_array_elements_text(p -> 'ids') with ordinality as e(id, ord)
   where t.id = e.id and t.sort_order is distinct from (e.ord - 1)::integer;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- 被指派的人：打開（seen）或按「收到」（ack）
-- p: { actor, actor_name, id, what: 'seen'|'ack' } → { status, task, notify }
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
  if v_t.assignee_email is distinct from v_actor then
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
  -- 打開任務時，順便把這個任務的通知標為已讀
  update public.pm_notifications as n set read_at = now()
   where n.recipient = v_actor and n.task_id = v_t.id and n.read_at is null;
  return jsonb_build_object('status', 'ok', 'task', to_jsonb(v_t), 'notify', v_notify);
end;
$$;


-- ───────────────────────── 9. 通知 ─────────────────────────

-- p: { actor, limit? } → { items, unread }
create or replace function public.pm_notifications_list(p jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_limit integer := least(greatest(coalesce(nullif(p ->> 'limit', '')::integer, 50), 1), 200);
begin
  return jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
        from (select * from public.pm_notifications as n
               where n.recipient = v_actor order by n.created_at desc limit v_limit) as s),
    'unread', (select count(*) from public.pm_notifications as n where n.recipient = v_actor and n.read_at is null));
end;
$$;

-- p: { actor, ids?:[…] }（沒給 ids = 全部已讀）→ { unread }
create or replace function public.pm_notifications_read(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
begin
  update public.pm_notifications as n set read_at = now()
   where n.recipient = v_actor and n.read_at is null
     and (p -> 'ids' is null or n.id in (select (e.v)::bigint from jsonb_array_elements_text(p -> 'ids') as e(v)));
  return jsonb_build_object('unread',
    (select count(*) from public.pm_notifications as n where n.recipient = v_actor and n.read_at is null));
end;
$$;


-- ───────────────────────── 10. 推播訂閱 ─────────────────────────

-- p: { actor, endpoint, p256dh, auth, user_agent }
create or replace function public.pm_push_save(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
begin
  if coalesce(p ->> 'endpoint', '') !~ '^https://' then
    raise exception 'pm_push_save: invalid endpoint' using errcode = '22023';
  end if;
  insert into public.pm_push_subscriptions (endpoint, email, p256dh, auth, user_agent)
  values (p ->> 'endpoint', v_actor, p ->> 'p256dh', p ->> 'auth', left(p ->> 'user_agent', 300))
  on conflict (endpoint) do update set
    email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_ok_at = now();
  return jsonb_build_object('status', 'ok');
end;
$$;

-- p: { endpoint } → 刪除（登出、或推播服務回 404/410）
create or replace function public.pm_push_delete(p jsonb)
returns jsonb
language sql
set search_path = ''
as $$
  with d as (delete from public.pm_push_subscriptions as s where s.endpoint = p ->> 'endpoint' returning 1)
  select jsonb_build_object('status', 'ok', 'deleted', (select count(*) from d));
$$;

-- p: { emails:[…] } → [{ endpoint, email, p256dh, auth }]
create or replace function public.pm_push_targets(p jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'email', s.email, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
    from public.pm_push_subscriptions as s
   where s.email in (select lower(e.v) from jsonb_array_elements_text(coalesce(p -> 'emails', '[]'::jsonb)) as e(v));
$$;


-- ───────────────────────── 11. 工程照 ─────────────────────────

-- p: { actor, actor_name, photo:{ id, project_code, task_id?, drive_file_id, drive_url, file_name, caption, taken_on, thumb, width, height, bytes } }
create or replace function public.pm_photo_add(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_in    jsonb := coalesce(p -> 'photo', '{}'::jsonb);
  v_row   public.pm_photos;
begin
  perform set_config('pm.actor', v_actor, true);
  perform public.pm__ensure_project(v_in ->> 'project_code', v_actor);
  v_row := jsonb_populate_record(null::public.pm_photos, v_in);
  v_row.uploaded_by := v_actor;
  v_row.uploaded_by_name := coalesce(nullif(btrim(p ->> 'actor_name'), ''), split_part(v_actor, '@', 1));
  v_row.created_at := now();
  insert into public.pm_photos select (v_row).*
  on conflict (id) do nothing
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'photo', to_jsonb(v_row));
end;
$$;

-- p: { code, limit? } → { items }
create or replace function public.pm_photos_list(p jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb))
    from (select * from public.pm_photos as ph
           where ph.project_code = p ->> 'code'
           order by ph.created_at desc
           limit least(greatest(coalesce(nullif(p ->> 'limit', '')::integer, 200), 1), 500)) as s;
$$;


-- ───────────────────────── 12. RLS 與權限 ─────────────────────────

alter table public.pm_projects           enable row level security;
alter table public.pm_tasks              enable row level security;
alter table public.pm_notifications      enable row level security;
alter table public.pm_push_subscriptions enable row level security;
alter table public.pm_photos             enable row level security;
alter table public.pm_change_log         enable row level security;
-- 刻意不建立任何 policy：anon / authenticated 一律被擋。

revoke all on table public.pm_projects, public.pm_tasks, public.pm_notifications,
                    public.pm_push_subscriptions, public.pm_photos, public.pm_change_log
  from public, anon, authenticated;
grant select, insert, update, delete on table public.pm_projects, public.pm_tasks, public.pm_notifications,
                    public.pm_push_subscriptions, public.pm_photos
  to service_role;
grant select on table public.pm_change_log to service_role;

-- public schema 的函式預設 PUBLIC 可執行，而且會被 /rest/v1/rpc 公開 → 全部收回，只給 service_role
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

comment on table public.pm_projects           is '專案：一個代碼一列。只供伺服器 service role 存取。';
comment on table public.pm_tasks              is '任務／排程：指派、期限、狀態、已讀與收到。';
comment on table public.pm_notifications      is 'APP 內通知與推播紀錄。';
comment on table public.pm_push_subscriptions is 'Web Push 訂閱（每支手機一列）。';
comment on table public.pm_photos             is '工程照索引；檔案在 Google Drive。';
comment on table public.pm_change_log         is '變更紀錄（只由 trigger 寫入）。';

notify pgrst, 'reload schema';


-- ───────────────────────── 13. 自我檢查（選用） ─────────────────────────
-- anon 必須被擋（預期 permission denied）：
--   begin; set local role anon; select count(*) from public.pm_tasks; rollback;
