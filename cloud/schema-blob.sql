-- 小小世界 M2.2：给空间加一个 data 列，存整份共享数据（M4 实时/分表前先用整份同步）
alter table public.spaces add column if not exists data jsonb not null default '{}'::jsonb;

-- 成员可更新空间数据（配合 RLS）
create policy "members update spaces" on public.spaces
  for update using (public.is_space_member(id, auth.uid()));
