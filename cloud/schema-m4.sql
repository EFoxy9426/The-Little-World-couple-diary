-- 小小世界 M4：为 spaces 表开启 Realtime（数据变更推送给双方）
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'spaces'
  ) then
    alter publication supabase_realtime add table public.spaces;
  end if;
end $$;
