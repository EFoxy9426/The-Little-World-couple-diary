-- 小小世界 M1：离开或解散当前空间（测试/换号用）
create or replace function public.leave_my_space()
returns void language plpgsql security definer as $$
declare
  _uid uuid := auth.uid();
  _sp public.spaces;
begin
  if _uid is null then
    raise exception '请先登录，或登录已过期';
  end if;
  select s.* into _sp
  from public.spaces s
  join public.space_members m on m.space_id = s.id
  where m.user_id = _uid
  limit 1;
  if _sp.id is null then
    return;
  end if;
  if _sp.owner_id = _uid then
    delete from public.space_members where space_id = _sp.id;
    delete from public.spaces where id = _sp.id;
  else
    delete from public.space_members where space_id = _sp.id and user_id = _uid;
  end if;
end;
$$;
