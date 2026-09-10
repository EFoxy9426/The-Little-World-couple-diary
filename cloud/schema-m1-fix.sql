-- 小小世界 M1 修复：登录态为空时给中文提示（在 SQL Editor 再执行一次）
create or replace function public.create_space(p_name text)
returns jsonb language plpgsql security definer as $$
declare
  _uid uuid := auth.uid();
  _code text;
  _sp public.spaces;
begin
  if _uid is null then
    raise exception '请先登录，或登录已过期，请刷新页面重试';
  end if;
  if exists (select 1 from public.space_members m where m.user_id = _uid) then
    raise exception '你已经在一个空间里了';
  end if;
  _code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.spaces (name, owner_id, invite_code, invite_expires_at)
  values (coalesce(nullif(trim(p_name), ''), '小小世界'), _uid, _code, now() + interval '7 days')
  returning * into _sp;
  insert into public.space_members (space_id, user_id) values (_sp.id, _uid);
  return public.my_space();
end;
$$;

create or replace function public.join_space(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  _uid uuid := auth.uid();
  _sp public.spaces;
  _cnt int;
begin
  if _uid is null then
    raise exception '请先登录，或登录已过期，请刷新页面重试';
  end if;
  if exists (select 1 from public.space_members m where m.user_id = _uid) then
    raise exception '你已经在一个空间里了';
  end if;
  select s.* into _sp from public.spaces s
  where upper(s.invite_code) = upper(trim(p_code)) limit 1;
  if _sp.id is null then
    raise exception '邀请码不对，请检查后再试';
  end if;
  if _sp.invite_expires_at < now() then
    raise exception '这个邀请码已过期';
  end if;
  select count(*) into _cnt from public.space_members m where m.space_id = _sp.id;
  if _cnt >= 2 then
    raise exception '这个空间已经有两个人了';
  end if;
  insert into public.space_members (space_id, user_id) values (_sp.id, _uid);
  return public.my_space();
end;
$$;

create or replace function public.my_space()
returns jsonb language plpgsql security definer as $$
declare
  _uid uuid := auth.uid();
  _sp public.spaces;
  _members jsonb;
begin
  if _uid is null then
    return null;
  end if;
  select s.* into _sp from public.spaces s
  join public.space_members m on m.space_id = s.id
  where m.user_id = _uid
  order by s.created_at desc limit 1;
  if _sp.id is null then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email) order by m.joined_at), '[]'::jsonb)
  into _members
  from public.space_members m
  join auth.users u on u.id = m.user_id
  where m.space_id = _sp.id;
  return jsonb_build_object(
    'id', _sp.id,
    'name', _sp.name,
    'owner_id', _sp.owner_id,
    'invite_code', _sp.invite_code,
    'invite_expires_at', _sp.invite_expires_at,
    'members', _members
  );
end;
$$;
