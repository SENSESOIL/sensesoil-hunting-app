-- ═════════════════════════════════════════════════════════════════════
-- 狩獵管理：代表字不能重複（同一個字只能一個人用，先選先贏）
-- 必須先執行過 20261019000000_pm_profile_mark.sql。可以重複執行。
-- ═════════════════════════════════════════════════════════════════════

-- 萬一已經有重複的：保留最早選的那位，其他人改回預設（清空）
update public.pm_profiles as x set mark = null
 where x.mark is not null
   and exists (
     select 1 from public.pm_profiles as y
      where y.mark = x.mark and y.email <> x.email
        and (y.updated_at, y.email) < (x.updated_at, x.email)
   );

create unique index if not exists pm_profiles_mark_uniq on public.pm_profiles (mark) where mark is not null;

notify pgrst, 'reload schema';
