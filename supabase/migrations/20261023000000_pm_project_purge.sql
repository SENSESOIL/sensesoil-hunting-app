-- ═════════════════════════════════════════════════════════════════════
-- 刪除專案（APP 裡的資料全部清掉，只留案名）
--   pm_project_purge   管理者：刪掉這個專案的任務（含排程、子任務）、工程照紀錄、通知，
--                      專案資料（階段、日期、金額、分組、可編輯的人、雲端資料夾…）全部清空，
--                      只留代碼、名稱、單位。拾壤CRM 名冊不動；Google Drive 上的照片檔案不動。
-- ═════════════════════════════════════════════════════════════════════

-- p: { actor, role, code } → { status, tasks, photos }
create or replace function public.pm_project_purge(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor  text := public.pm__actor(p);
  v_code   text := btrim(coalesce(p ->> 'code', ''));
  v_tasks  integer;
  v_photos integer;
begin
  if coalesce(p ->> 'role', '') <> 'manager' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if v_code = '' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform set_config('pm.actor', v_actor, true);

  delete from public.pm_notifications as n where n.project_code = v_code;

  with d as (delete from public.pm_tasks as t where t.project_code = v_code returning 1)
  select count(*) into v_tasks from d;

  with d as (delete from public.pm_photos as ph where ph.project_code = v_code returning 1)
  select count(*) into v_photos from d;

  update public.pm_projects as x set
    stage = null, category = null, site = null, client = null, manager = null,
    signed_on = null, start_on = null, due_on = null, done_on = null,
    contract = null, variation = null, billed = null, collected = null,
    progress = null, risk = null, note = null, drive_folder_id = null,
    archived = false, sections = '[]'::jsonb, editors = '{}',
    updated_by = v_actor
  where x.code = v_code;

  return jsonb_build_object('status', 'ok', 'tasks', v_tasks, 'photos', v_photos);
end;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('pm_project_purge')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
