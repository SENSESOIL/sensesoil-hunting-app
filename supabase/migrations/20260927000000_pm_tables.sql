-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：專案情報／工進排程  schema v1
--
-- 目標專案：APP 自己的 Supabase 專案（Vercel 的 NEXT_PUBLIC_SUPABASE_URL，
--           裡面有 hunting_tasks 那個）。
--           ⚠ 不是組織圖專案 rynhfvyoaswynyvghyzi。
-- 用法：Supabase → SQL Editor → 整段貼上 → Run。可重複執行（idempotent）。
-- 安全模型：只給伺服器端 secret / service_role 金鑰使用。
--   四張表都開 RLS、不建任何 policy，並撤銷 anon / authenticated 權限
--   → 瀏覽器即使拿到公開的 anon key，也讀不到、寫不進。
--   service_role 有 BYPASSRLS，由 Next.js API（checkPermissions）負責授權。
--   下面的明確 GRANT 也涵蓋「Data API 不自動公開新表」的新專案設定。
-- 單位：金額 = 新台幣「元」整數（bigint），UI 再換算成「萬」。
--       日期 = date（無時區）。進度 = 0–100 整數。
-- 之後的欄位變更請新增 migration 檔，不要回頭改這一份。
--
-- APP 欄位對照（src/lib/project-ops.ts 的 OpsRecord / WorkItem → 資料表）：
--   signedAt→signed_on  startAt→start_on  dueAt→due_on  doneAt→done_on
--   WorkItem.start→start_on  end→end_on  seq→sort_order  code→project_code
--   OpsRecord.updatedAt 由 updated_at 產生（台北時間日期）；版本號另外帶 version / items_version。
-- ═════════════════════════════════════════════════════════════════════


-- ───────────────────────── 1. 資料表 ─────────────────────────

create table if not exists public.pm_projects (
  code           text        primary key,                  -- 對應 拾壤CRM「專案CRM」的代碼（A08、B37…）
  stage          text,
  category       text,
  site           text,                                     -- 工地地址
  client         text,                                     -- 業主
  manager        text,                                     -- 工地主任（狩獵者姓名）
  members        text[]      not null default '{}',        -- 其他參與的狩獵者（選用）
  signed_on      date,                                     -- 簽約日
  start_on       date,                                     -- 開工日
  due_on         date,                                     -- 預計完工
  done_on        date,                                     -- 實際完工
  contract       bigint,                                   -- 合約金額（元）
  variation      bigint,                                   -- 追加減（元，可為負）
  billed         bigint,                                   -- 累計已請款（元）
  collected      bigint,                                   -- 累計已收款（元）
  progress       smallint,                                 -- 實際進度 0–100
  risk           text,
  note           text,                                     -- 近況
  version        integer     not null default 1,           -- 專案欄位的樂觀鎖（trigger 自動 +1）
  items_version  integer     not null default 0,           -- 工項清單的樂觀鎖（pm_save_work_items +1）
  created_at     timestamptz not null default now(),
  created_by     text        not null default 'system',
  updated_at     timestamptz not null default now(),
  updated_by     text        not null default 'system',
  constraint pm_projects_code_chk      check (code = btrim(code) and char_length(code) between 1 and 32),
  constraint pm_projects_stage_chk     check (stage is null or stage in ('洽談','報價','簽約','施工中','驗收','保固','結案','暫停')),
  constraint pm_projects_category_chk  check (category is null or category in ('室內裝修','泥作工藝','拆除','防水','修繕維護','追加減')),
  constraint pm_projects_risk_chk      check (risk is null or risk in ('正常','注意','異常')),
  constraint pm_projects_progress_chk  check (progress is null or progress between 0 and 100),
  constraint pm_projects_due_chk       check (due_on  is null or start_on is null or due_on  >= start_on),
  constraint pm_projects_done_chk      check (done_on is null or start_on is null or done_on >= start_on),
  constraint pm_projects_contract_chk  check (contract  is null or contract  between 0 and 100000000000),
  constraint pm_projects_variation_chk check (variation is null or variation between -100000000000 and 100000000000),
  constraint pm_projects_billed_chk    check (billed    is null or billed    between 0 and 100000000000),
  constraint pm_projects_collected_chk check (collected is null or collected between 0 and 100000000000),
  constraint pm_projects_text_len_chk  check (
        coalesce(char_length(site), 0)    <= 200
    and coalesce(char_length(client), 0)  <= 100
    and coalesce(char_length(manager), 0) <= 50
    and coalesce(char_length(note), 0)    <= 1000
    and cardinality(members)              <= 30
  ),
  constraint pm_projects_version_chk   check (version >= 1 and items_version >= 0)
);

create table if not exists public.pm_work_items (
  id            text        primary key default gen_random_uuid()::text,  -- 前端自帶 newId()（例：wi-3f9a1c2b），試編／離線建立的工項不用換 id
  project_code  text        not null references public.pm_projects(code) on update cascade on delete cascade,
  trade         text        not null,                               -- 工項
  kind          text,                                               -- 類型：施工（null 視同施工）／等待／檢驗／里程碑
  crew          text,                                               -- 施作單位／工班
  start_on      date,
  end_on        date,
  progress      smallint    not null default 0,
  sort_order    integer     not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  created_by    text        not null default 'system',
  updated_at    timestamptz not null default now(),
  updated_by    text        not null default 'system',
  constraint pm_work_items_id_chk       check (char_length(id) between 1 and 64),
  constraint pm_work_items_kind_chk     check (kind is null or kind in ('施工','等待','檢驗','里程碑')),
  constraint pm_work_items_trade_chk    check (btrim(trade) <> '' and char_length(trade) <= 40),
  constraint pm_work_items_crew_chk     check (crew is null or char_length(crew) <= 40),
  constraint pm_work_items_note_chk     check (note is null or char_length(note) <= 500),
  constraint pm_work_items_dates_chk    check (end_on is null or start_on is null or end_on >= start_on),
  constraint pm_work_items_progress_chk check (progress between 0 and 100),
  constraint pm_work_items_sort_chk     check (sort_order >= 0)
);

-- 變更紀錄：只准 trigger（security definer）寫入；service_role 只能讀。
create table if not exists public.pm_change_log (
  id            bigint      generated always as identity primary key,
  changed_at    timestamptz not null default now(),
  actor         text        not null,                     -- 使用者 email（API 從 session 取）；import:xxx；db:postgres
  table_name    text        not null check (table_name in ('pm_projects','pm_work_items')),
  op            text        not null check (op in ('INSERT','UPDATE','DELETE')),
  project_code  text        not null,                     -- 不設外鍵：專案刪除後紀錄仍保留
  row_key       text        not null,                     -- 專案 = code；工項 = id
  diff          jsonb       not null,                     -- { 欄位: { "from": 舊值, "to": 新值 } }
  mutation_id   uuid
);

-- 冪等鍵：同一個 mutationId 重送（逾時重試、離線佇列）不會套用兩次。
create table if not exists public.pm_mutations (
  id            uuid        primary key,
  project_code  text        not null,
  kind          text        not null check (kind in ('project','items')),
  actor         text        not null,
  applied_at    timestamptz not null default now()
);


-- ───────────────────────── 2. 索引 ─────────────────────────

create index if not exists pm_projects_stage_idx      on public.pm_projects (stage);
create index if not exists pm_projects_manager_idx    on public.pm_projects (manager);
create index if not exists pm_projects_updated_idx    on public.pm_projects (updated_at desc);
create index if not exists pm_projects_open_due_idx   on public.pm_projects (due_on) where done_on is null;
create index if not exists pm_projects_members_gin    on public.pm_projects using gin (members);

create index if not exists pm_work_items_project_idx  on public.pm_work_items (project_code, sort_order);
create index if not exists pm_work_items_window_idx   on public.pm_work_items (start_on, end_on) where start_on is not null;
create index if not exists pm_work_items_updated_idx  on public.pm_work_items (updated_at desc);

create index if not exists pm_change_log_project_idx  on public.pm_change_log (project_code, changed_at desc);
create index if not exists pm_change_log_time_idx     on public.pm_change_log (changed_at desc);
create index if not exists pm_change_log_mutation_idx on public.pm_change_log (mutation_id) where mutation_id is not null;

create index if not exists pm_mutations_applied_idx   on public.pm_mutations (applied_at);


-- ───────────────────────── 3. updated_at / version trigger ─────────────────────────
-- created_* 不可被改；updated_at 一律由資料庫設定；
-- pm_projects.version 只在「內容欄位」真的有變時 +1
-- （只動 items_version 的更新不會 +1，避免改排程時誤判專案欄位衝突）。

create or replace function public.pm_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_noise constant text[] := array['version','items_version','created_at','created_by','updated_at','updated_by'];
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  if tg_table_name = 'pm_projects' then
    new.version := old.version;
    if (to_jsonb(new) - v_noise) is distinct from (to_jsonb(old) - v_noise) then
      new.version := old.version + 1;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pm_projects_touch on public.pm_projects;
create trigger pm_projects_touch
  before update on public.pm_projects
  for each row execute function public.pm_touch();

drop trigger if exists pm_work_items_touch on public.pm_work_items;
create trigger pm_work_items_touch
  before update on public.pm_work_items
  for each row execute function public.pm_touch();


-- ───────────────────────── 4. 變更紀錄 trigger ─────────────────────────
-- 只記「真的有變」的欄位。排序（sort_order）的變動不記，
-- 否則插入一個工項就會連帶產生十幾筆紀錄。
-- actor 來源優先順序：RPC 設定的 pm.actor → 該列的 updated_by → db:<連線角色>。

create or replace function public.pm_log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old   jsonb := '{}'::jsonb;
  v_new   jsonb := '{}'::jsonb;
  v_noise constant text[] := array['version','items_version','created_at','created_by','updated_at','updated_by','sort_order'];
  v_diff  jsonb;
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;

  select coalesce(
           jsonb_object_agg(k.col, jsonb_build_object('from', v_old -> k.col, 'to', v_new -> k.col)),
           '{}'::jsonb)
    into v_diff
    from (select jsonb_object_keys(v_old) as col
          union
          select jsonb_object_keys(v_new)) as k
   where not (k.col = any (v_noise))
     and coalesce(v_old -> k.col, 'null'::jsonb) is distinct from coalesce(v_new -> k.col, 'null'::jsonb);

  if v_diff = '{}'::jsonb then
    return null;
  end if;

  insert into public.pm_change_log (actor, table_name, op, project_code, row_key, diff, mutation_id)
  values (
    coalesce(nullif(current_setting('pm.actor', true), ''), v_new ->> 'updated_by', 'db:' || session_user),
    tg_table_name,
    tg_op,
    coalesce(v_new ->> 'project_code', v_old ->> 'project_code', v_new ->> 'code', v_old ->> 'code'),
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'code', v_old ->> 'code'),
    v_diff,
    nullif(current_setting('pm.mutation_id', true), '')::uuid
  );
  return null;
end;
$$;

drop trigger if exists pm_projects_log on public.pm_projects;
create trigger pm_projects_log
  after insert or update or delete on public.pm_projects
  for each row execute function public.pm_log_change();

drop trigger if exists pm_work_items_log on public.pm_work_items;
create trigger pm_work_items_log
  after insert or update or delete on public.pm_work_items
  for each row execute function public.pm_log_change();


-- ───────────────────────── 5. 寫入 RPC（只給 service_role） ─────────────────────────

-- 5a. 某專案的工項（依排序）
create or replace function public.pm_items_json(p_code text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(w) order by w.sort_order, w.start_on nulls last, w.created_at), '[]'::jsonb)
    from public.pm_work_items as w
   where w.project_code = p_code;
$$;

-- 5b. 存專案欄位（部分更新＋樂觀鎖＋冪等）
--   p_base_version：client 編輯時看到的 version；0 = 這個專案還沒有資料（建立）
--   p_patch：snake_case；有的 key 才更新，值為 null = 清空；code／version／created_* 等會被忽略
--   回傳 { status: ok|created|unchanged|duplicate|conflict|not_found, project }
create or replace function public.pm_save_project(
  p_code         text,
  p_base_version integer,
  p_patch        jsonb,
  p_actor        text,
  p_mutation_id  uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_noise   constant text[] := array['code','version','items_version','created_at','created_by','updated_at','updated_by'];
  v_base    integer := coalesce(p_base_version, 0);
  v_patch   jsonb;
  v_row     public.pm_projects;
  v_new     public.pm_projects;
  v_found   boolean;
  v_created boolean := false;
  v_changed boolean := false;
begin
  if coalesce(btrim(p_actor), '') = '' then
    raise exception 'pm_save_project: actor is required' using errcode = '22023';
  end if;
  if p_patch is not null and jsonb_typeof(p_patch) <> 'object' then
    raise exception 'pm_save_project: patch must be a JSON object' using errcode = '22023';
  end if;
  v_patch := coalesce(p_patch, '{}'::jsonb) - v_noise;

  perform set_config('pm.actor', p_actor, true);
  perform set_config('pm.mutation_id', coalesce(p_mutation_id::text, ''), true);

  select * into v_row from public.pm_projects as p where p.code = p_code for update;
  v_found := found;

  -- 冪等：同一個 mutation 重送 → 不再套用，回傳現況
  if p_mutation_id is not null
     and exists (select 1 from public.pm_mutations as m where m.id = p_mutation_id) then
    return jsonb_build_object('status', 'duplicate',
      'project', (select to_jsonb(p) from public.pm_projects as p where p.code = p_code));
  end if;

  if not v_found then
    if v_base <> 0 then
      return jsonb_build_object('status', 'not_found');
    end if;
    insert into public.pm_projects (code, created_by, updated_by)
    values (p_code, p_actor, p_actor)
    on conflict (code) do nothing
    returning * into v_row;
    if not found then
      -- 另一台裝置剛好同時建立
      return jsonb_build_object('status', 'conflict',
        'project', (select to_jsonb(p) from public.pm_projects as p where p.code = p_code));
    end if;
    v_created := true;
    v_base := v_row.version;
  end if;

  if v_row.version <> v_base then
    return jsonb_build_object('status', 'conflict', 'project', to_jsonb(v_row));
  end if;

  v_new := jsonb_populate_record(v_row, v_patch);

  if (to_jsonb(v_new) - v_noise) is distinct from (to_jsonb(v_row) - v_noise) then
    update public.pm_projects as p set
      stage      = v_new.stage,
      category   = v_new.category,
      site       = v_new.site,
      client     = v_new.client,
      manager    = v_new.manager,
      members    = coalesce(v_new.members, '{}'),
      signed_on  = v_new.signed_on,
      start_on   = v_new.start_on,
      due_on     = v_new.due_on,
      done_on    = v_new.done_on,
      contract   = v_new.contract,
      variation  = v_new.variation,
      billed     = v_new.billed,
      collected  = v_new.collected,
      progress   = v_new.progress,
      risk       = v_new.risk,
      note       = v_new.note,
      updated_by = p_actor
    where p.code = p_code
    returning * into v_row;
    v_changed := true;
  end if;

  if p_mutation_id is not null then
    insert into public.pm_mutations (id, project_code, kind, actor)
    values (p_mutation_id, p_code, 'project', p_actor);
  end if;

  return jsonb_build_object(
    'status',  case when v_created then 'created' when v_changed then 'ok' else 'unchanged' end,
    'project', to_jsonb(v_row));
end;
$$;

-- 5c. 存某專案的「整份」工項清單（單一交易）
--   p_items：[{ id?, trade, kind?, crew?, start_on?, end_on?, progress?, note? }, …]
--            陣列順序 = sort_order；DB 有但清單沒有的 id = 刪除；沒有 id = 新增
--   p_base_version：client 看到的 items_version（專案還沒建檔時為 0）
--   回傳 { status: ok|unchanged|duplicate|conflict|not_found, itemsVersion, changed, items }
create or replace function public.pm_save_work_items(
  p_code         text,
  p_base_version integer,
  p_items        jsonb,
  p_actor        text,
  p_mutation_id  uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_proj    public.pm_projects;
  v_base    integer := coalesce(p_base_version, 0);
  v_changed integer := 0;
  v_n       integer;
begin
  if coalesce(btrim(p_actor), '') = '' then
    raise exception 'pm_save_work_items: actor is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'pm_save_work_items: items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 300 then
    raise exception 'pm_save_work_items: too many items (max 300)' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) as e(item) where jsonb_typeof(e.item) <> 'object') then
    raise exception 'pm_save_work_items: every item must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_items) as e(item)
     where e.item ->> 'id' is not null
     group by e.item ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'pm_save_work_items: duplicate item id' using errcode = '22023';
  end if;

  perform set_config('pm.actor', p_actor, true);
  perform set_config('pm.mutation_id', coalesce(p_mutation_id::text, ''), true);

  -- 鎖住專案列：同一專案的排程存檔依序進行
  select * into v_proj from public.pm_projects as p where p.code = p_code for update;
  if not found then
    if v_base <> 0 then
      return jsonb_build_object('status', 'not_found');
    end if;
    insert into public.pm_projects (code, created_by, updated_by)
    values (p_code, p_actor, p_actor)
    on conflict (code) do nothing
    returning * into v_proj;
    if not found then
      select * into v_proj from public.pm_projects as p where p.code = p_code for update;
    end if;
  end if;

  if p_mutation_id is not null
     and exists (select 1 from public.pm_mutations as m where m.id = p_mutation_id) then
    return jsonb_build_object('status', 'duplicate', 'itemsVersion', v_proj.items_version,
                              'items', public.pm_items_json(p_code));
  end if;

  if v_proj.items_version <> v_base then
    return jsonb_build_object('status', 'conflict', 'itemsVersion', v_proj.items_version,
                              'updatedBy', v_proj.updated_by, 'updatedAt', v_proj.updated_at,
                              'items', public.pm_items_json(p_code));
  end if;

  -- 不允許把別的專案的工項 id 搬過來
  if exists (
    select 1
      from jsonb_array_elements(p_items) as e(item)
      join public.pm_work_items as w on w.id = (e.item ->> 'id')
     where w.project_code <> p_code
  ) then
    raise exception 'pm_save_work_items: item id belongs to another project' using errcode = '22023';
  end if;

  -- 刪除：DB 有、清單沒有
  delete from public.pm_work_items as w
   where w.project_code = p_code
     and w.id not in (
       select (e.item ->> 'id')
         from jsonb_array_elements(p_items) as e(item)
        where e.item ->> 'id' is not null
     );
  get diagnostics v_n = row_count;
  v_changed := v_changed + v_n;

  -- 新增／更新（只更新真的有變的列，避免歷程雜訊）
  with src as (
    select coalesce(nullif(btrim(r.id), ''), gen_random_uuid()::text) as id,
           btrim(r.trade)                     as trade,
           nullif(r.kind, '施工')             as kind,
           nullif(btrim(r.crew), '')          as crew,
           r.start_on                         as start_on,
           r.end_on                           as end_on,
           coalesce(r.progress, 0::smallint)  as progress,
           (e.ord - 1)::integer               as sort_order,
           nullif(btrim(r.note), '')          as note
      from jsonb_array_elements(p_items) with ordinality as e(item, ord)
     cross join lateral jsonb_to_record(e.item)
           as r(id text, trade text, kind text, crew text, start_on date, end_on date, progress smallint, note text)
  )
  insert into public.pm_work_items as w
         (id, project_code, trade, kind, crew, start_on, end_on, progress, sort_order, note, created_by, updated_by)
  select s.id, p_code, s.trade, s.kind, s.crew, s.start_on, s.end_on, s.progress, s.sort_order, s.note, p_actor, p_actor
    from src as s
  on conflict (id) do update set
         trade      = excluded.trade,
         kind       = excluded.kind,
         crew       = excluded.crew,
         start_on   = excluded.start_on,
         end_on     = excluded.end_on,
         progress   = excluded.progress,
         sort_order = excluded.sort_order,
         note       = excluded.note,
         updated_by = excluded.updated_by
   where (w.trade, w.kind, w.crew, w.start_on, w.end_on, w.progress, w.sort_order, w.note)
         is distinct from
         (excluded.trade, excluded.kind, excluded.crew, excluded.start_on, excluded.end_on, excluded.progress, excluded.sort_order, excluded.note);
  get diagnostics v_n = row_count;
  v_changed := v_changed + v_n;

  if v_changed > 0 then
    update public.pm_projects as p
       set items_version = p.items_version + 1,
           updated_by    = p_actor
     where p.code = p_code
    returning * into v_proj;
  end if;

  if p_mutation_id is not null then
    insert into public.pm_mutations (id, project_code, kind, actor)
    values (p_mutation_id, p_code, 'items', p_actor);
  end if;

  return jsonb_build_object(
    'status',       case when v_changed > 0 then 'ok' else 'unchanged' end,
    'itemsVersion', v_proj.items_version,
    'changed',      v_changed,
    'items',        public.pm_items_json(p_code));
end;
$$;


-- ───────────────────────── 6. RLS 與權限 ─────────────────────────

alter table public.pm_projects   enable row level security;
alter table public.pm_work_items enable row level security;
alter table public.pm_change_log enable row level security;
alter table public.pm_mutations  enable row level security;
-- 刻意不建立任何 policy：anon / authenticated 一律被 RLS 擋下。

revoke all on table public.pm_projects, public.pm_work_items, public.pm_change_log, public.pm_mutations
  from public, anon, authenticated;

revoke all on table public.pm_projects, public.pm_work_items, public.pm_change_log, public.pm_mutations
  from service_role;
grant select, insert, update, delete
  on table public.pm_projects, public.pm_work_items, public.pm_mutations
  to service_role;
grant select on table public.pm_change_log to service_role;   -- 歷程只能讀；寫入只經由 trigger（security definer）

-- public schema 的函式預設會被 PostgREST 以 /rest/v1/rpc 公開，而且 PUBLIC 有執行權 → 一律收回
revoke all on function public.pm_touch()                                           from public, anon, authenticated;
revoke all on function public.pm_log_change()                                      from public, anon, authenticated;
revoke all on function public.pm_items_json(text)                                  from public, anon, authenticated;
revoke all on function public.pm_save_project(text, integer, jsonb, text, uuid)    from public, anon, authenticated;
revoke all on function public.pm_save_work_items(text, integer, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function
  public.pm_touch(),
  public.pm_log_change(),
  public.pm_items_json(text),
  public.pm_save_project(text, integer, jsonb, text, uuid),
  public.pm_save_work_items(text, integer, jsonb, text, uuid)
  to service_role;


-- ───────────────────────── 7. 說明（顯示在 Supabase Table Editor） ─────────────────────────

comment on table  public.pm_projects   is '專案情報：一個專案代碼一列（代碼對應 拾壤CRM 專案CRM）。只供伺服器 service role 存取。';
comment on column public.pm_projects.contract      is '合約金額，新台幣元（整數），UI 以萬顯示';
comment on column public.pm_projects.variation     is '追加減，新台幣元（整數，追減為負）';
comment on column public.pm_projects.billed        is '累計已請款，新台幣元';
comment on column public.pm_projects.collected     is '累計已收款，新台幣元';
comment on column public.pm_projects.version       is '專案欄位樂觀鎖；內容有變時由 trigger +1';
comment on column public.pm_projects.items_version is '工項清單樂觀鎖；pm_save_work_items 有變動時 +1';
comment on table  public.pm_work_items is '工進排程：一個工項一列；以 pm_save_work_items 整份清單存檔';
comment on table  public.pm_change_log is '變更紀錄（append-only）：誰、何時、哪些欄位 from→to；只有 trigger 能寫';
comment on table  public.pm_mutations  is '冪等鍵：client 產生的 mutationId，重送不重複套用；90 天以上可清除';

notify pgrst, 'reload schema';


-- ───────────────────────── 8. 自我檢查（選用；逐段選取執行） ─────────────────────────
-- 8a. anon 必須被擋（預期 ERROR: permission denied for table pm_projects）
-- begin; set local role anon; select count(*) from public.pm_projects; rollback;
--
-- 8b. 寫入、樂觀鎖、歷程
-- select public.pm_save_project('ZZTEST', 0, '{"stage":"施工中","start_on":"2026-09-01","due_on":"2026-10-31","progress":20,"contract":1850000}'::jsonb, 'test@local');   -- created，version=2
-- select public.pm_save_work_items('ZZTEST', 0, '[{"trade":"保護工程","start_on":"2026-09-01","end_on":"2026-09-02","progress":100},{"trade":"泥作打底","start_on":"2026-09-03","end_on":"2026-09-10"}]'::jsonb, 'test@local');   -- ok，itemsVersion=1
-- select public.pm_save_project('ZZTEST', 1, '{"progress":30}'::jsonb, 'test@local');   -- conflict（目前 version 是 2）
-- select public.pm_save_project('ZZTEST', 2, '{"progress":30}'::jsonb, 'test@local');   -- ok，version=3
-- select id, actor, table_name, op, row_key, diff from public.pm_change_log where project_code = 'ZZTEST' order by id;
--
-- 8c. 清掉測試資料（歷程只有 postgres 能刪）
-- delete from public.pm_projects   where code = 'ZZTEST';
-- delete from public.pm_change_log where project_code = 'ZZTEST';
--
-- 8d. 定期清理（選用，可放 pg_cron）
-- delete from public.pm_mutations where applied_at < now() - interval '90 days';