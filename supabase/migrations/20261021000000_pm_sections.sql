-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：專案裡的「分組」（像提醒事項的 Section）
-- 必須先執行過 20260928000000_pm_schema.sql、20261017000000_pm_task_tree.sql。可以重複執行。
--
--   pm_projects.sections  分組清單 [{ id, name }]（順序＝畫面順序）
--   任務屬於哪個分組：pm_tasks.meta.section（分組 id）；分組被刪掉的任務自動回到「其他」
--   pm_sections_set       整份覆寫分組清單（管理者）
-- ═════════════════════════════════════════════════════════════════════

alter table public.pm_projects add column if not exists sections jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pm_projects_sections_chk') then
    alter table public.pm_projects add constraint pm_projects_sections_chk check (
      jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) <= 50 and octet_length(sections::text) <= 8000
    );
  end if;
end $$;

-- p: { actor, role, code, sections: [{ id, name }] } → { status, sections }
create or replace function public.pm_sections_set(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor text := public.pm__actor(p);
  v_code  text := btrim(coalesce(p ->> 'code', ''));
  v_list  jsonb := coalesce(p -> 'sections', '[]'::jsonb);
  v_row   public.pm_projects;
begin
  if coalesce(p ->> 'role', '') <> 'manager' then
    return jsonb_build_object('status', 'forbidden');
  end if;
  if v_code = '' or jsonb_typeof(v_list) <> 'array' then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform set_config('pm.actor', v_actor, true);
  perform public.pm__ensure_project(v_code, v_actor);
  update public.pm_projects as x set sections = v_list, updated_by = v_actor
   where x.code = v_code
  returning * into v_row;
  return jsonb_build_object('status', 'ok', 'sections', v_row.sections);
end;
$$;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('pm_sections_set')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
