-- 小小世界 M3：私有照片桶 + 仅空间成员可见
insert into storage.buckets (id, name, public, file_size_limit)
values ('couple-photos', 'couple-photos', false, 10485760)
on conflict (id) do nothing;

-- 上传/读取/删除：路径首段是 space_id
create policy "cp insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'couple-photos'
    and public.is_space_member(split_part(name, '/', 1)::uuid, auth.uid())
  );
create policy "cp select" on storage.objects for select to authenticated
  using (
    bucket_id = 'couple-photos'
    and public.is_space_member(split_part(name, '/', 1)::uuid, auth.uid())
  );
create policy "cp delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'couple-photos'
    and public.is_space_member(split_part(name, '/', 1)::uuid, auth.uid())
  );
