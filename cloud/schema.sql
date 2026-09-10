-- ============================================================
-- 小小世界 云端版 M1：账号 + 空间 + 邀请码绑定
-- 在 Supabase 控制台 SQL Editor 里整段执行一次即可
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default '小小世界',
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text unique not null,
  invite_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

alter table public.spaces enable row level security;
alter table public.space_members enable row level security;

create or replace function public.is_space_member(_space uuid, _uid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = _space and m.user_id = _uid
  );
$$;

create policy "成员可查看自己的空间" on public.spaces
  for select using (public.is_space_member(id, auth.uid()));
create policy "成员可查看自己的成员关系" on public.space_members
  for select using (public.is_space_member(space_id, auth.uid()));

-- 获取我的空间（含成员）
create or replace function public.my_space()
returns jsonb language plpgsql security definer as $$
declare
  _sp public.spaces;
  _members jsonb;
begin
  select s.* into _sp from public.spaces s
  join public.space_members m on m.space_id = s.id
  where m.user_id = auth.uid()
  order by s.created_at desc limit 1;

  if _sp.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', u.id,
    'email', u.email
  ) order by m.joined_at), '[]'::jsonb) into _members
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

-- 创建空间
create or replace function public.create_space(p_name text)
returns jsonb language plpgsql security definer as $$
declare
  _code text;
  _sp public.spaces;
begin
  -- 每人只能属于一个空间
  if exists (
    select 1 from public.space_members m where m.user_id = auth.uid()
  ) then
    raise exception '你已经在一个空间里了';
  end if;

  _code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.spaces (name, owner_id, invite_code, invite_expires_at)
  values (coalesce(nullif(trim(p_name), ''), '小小世界'), auth.uid(), _code, now() + interval '7 days')
  returning * into _sp;

  insert into public.space_members (space_id, user_id) values (_sp.id, auth.uid());

  return public.my_space();
end;
$$;

-- 用邀请码加入
create or replace function public.join_space(p_code text)
returns jsonb language plpgsql security definer as $$
declare
  _sp public.spaces;
  _cnt int;
begin
  if exists (
    select 1 from public.space_members m where m.user_id = auth.uid()
  ) then
    raise exception '你已经在一个空间里了';
  end if;

  select s.* into _sp from public.spaces s
  where upper(s.invite_code) = upper(trim(p_code))
  limit 1;

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

  insert into public.space_members (space_id, user_id) values (_sp.id, auth.uid());
  return public.my_space();
end;
$$;

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
