-- ============================================================
-- TA 的小本本 · 数据库（v0.2，含三条决策）
--   1) 存在可见性默认关闭（existence_visible = false），由记录者手动开启
--   2) 支持按分类申请（scope = all / category / note）
--   3) 支持删除请求（kind = deletion）
-- 在 Supabase SQL Editor 整段执行一次
-- ============================================================

create table if not exists public.partner_notes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  about_user_id uuid not null references auth.users(id),
  category text not null default '其他' check (category in ('口味忌口','爱好想要','雷区','习惯作息','其他')),
  text text not null default '',
  why text,
  visibility text not null default 'private' check (visibility in ('private','requestable','shared')),
  existence_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.partner_notes(id) on delete cascade,
  viewer_id uuid not null references auth.users(id),
  granted_by uuid not null references auth.users(id),
  can_comment boolean not null default false,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.note_access_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  requester_id uuid not null references auth.users(id),
  owner_id uuid not null references auth.users(id),
  kind text not null default 'access' check (kind in ('access','deletion')),
  scope text not null default 'all' check (scope in ('all','category','note')),
  scope_value text,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.note_explanations (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.partner_notes(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.note_view_logs (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.partner_notes(id) on delete cascade,
  viewer_id uuid not null references auth.users(id),
  viewed_at timestamptz not null default now()
);

create index if not exists idx_partner_notes_space on public.partner_notes(space_id);
create index if not exists idx_partner_notes_about on public.partner_notes(about_user_id);
create index if not exists idx_note_shares_note on public.note_shares(note_id);
create index if not exists idx_note_requests_owner on public.note_access_requests(owner_id, status);

-- ============ 可读判定 ============
create or replace function public.can_read_note(_note_id uuid, _uid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.partner_notes n
    where n.id = _note_id
      and n.deleted_at is null
      and (
        n.author_id = _uid
        or (n.about_user_id = _uid and n.visibility = 'shared')
        or exists (
          select 1 from public.note_shares s
          where s.note_id = n.id and s.viewer_id = _uid
            and s.revoked_at is null
            and (s.expires_at is null or s.expires_at > now())
        )
      )
  );
$$;

alter table public.partner_notes enable row level security;
alter table public.note_shares enable row level security;
alter table public.note_access_requests enable row level security;
alter table public.note_explanations enable row level security;
alter table public.note_view_logs enable row level security;

drop policy if exists "pn author all" on public.partner_notes;
create policy "pn author all" on public.partner_notes
  for all using (author_id = auth.uid()) with check (author_id = auth.uid() and public.is_space_member(space_id, auth.uid()));

drop policy if exists "pn readable" on public.partner_notes;
create policy "pn readable" on public.partner_notes
  for select using (public.can_read_note(id, auth.uid()));

drop policy if exists "ns owner rw" on public.note_shares;
create policy "ns owner rw" on public.note_shares
  for all using (
    exists (select 1 from public.partner_notes n where n.id = note_id and n.author_id = auth.uid())
  ) with check (
    exists (select 1 from public.partner_notes n where n.id = note_id and n.author_id = auth.uid())
  );

drop policy if exists "ns viewer read" on public.note_shares;
create policy "ns viewer read" on public.note_shares
  for select using (viewer_id = auth.uid());

drop policy if exists "nr involved" on public.note_access_requests;
create policy "nr involved" on public.note_access_requests
  for select using (requester_id = auth.uid() or owner_id = auth.uid());

drop policy if exists "nr requester insert" on public.note_access_requests;
create policy "nr requester insert" on public.note_access_requests
  for insert with check (requester_id = auth.uid() and public.is_space_member(space_id, auth.uid()));

drop policy if exists "nr owner update" on public.note_access_requests;
create policy "nr owner update" on public.note_access_requests
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "ne involved read" on public.note_explanations;
create policy "ne involved read" on public.note_explanations
  for select using (
    exists (
      select 1 from public.partner_notes n
      where n.id = note_id and (n.author_id = auth.uid() or n.about_user_id = auth.uid())
    )
  );

drop policy if exists "ne about insert" on public.note_explanations;
create policy "ne about insert" on public.note_explanations
  for insert with check (
    author_id = auth.uid()
    and exists (select 1 from public.partner_notes n where n.id = note_id and n.about_user_id = auth.uid())
  );

drop policy if exists "nvl viewer insert" on public.note_view_logs;
create policy "nvl viewer insert" on public.note_view_logs
  for insert with check (viewer_id = auth.uid() and public.can_read_note(note_id, auth.uid()));

drop policy if exists "nvl author read" on public.note_view_logs;
create policy "nvl author read" on public.note_view_logs
  for select using (
    exists (select 1 from public.partner_notes n where n.id = note_id and n.author_id = auth.uid())
  );

-- ============ RPC：聚合数据（前端一次拉取） ============
create or replace function public.partner_notebook_data()
returns jsonb language plpgsql security definer as $$
declare
  _uid uuid := auth.uid();
  _my_notes jsonb;
  _about_me jsonb;
  _requests jsonb;
  _shares jsonb;
  _exps jsonb;
begin
  if _uid is null then return null; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into _my_notes
  from (
    select n.id, n.category, n.text, n.why, n.visibility, n.existence_visible, n.created_at,
      (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'viewer_id', s.viewer_id, 'expires_at', s.expires_at, 'revoked_at', s.revoked_at)), '[]'::jsonb)
       from public.note_shares s where s.note_id = n.id) as shares
    from public.partner_notes n
    where n.author_id = _uid and n.deleted_at is null
  ) x;

  select coalesce(jsonb_agg(to_jsonb(y) order by y.created_at desc), '[]'::jsonb) into _about_me
  from (
    select n.id, n.category, n.created_at,
      public.can_read_note(n.id, _uid) as can_read,
      case when public.can_read_note(n.id, _uid) then n.text else null end as text,
      case when public.can_read_note(n.id, _uid) then n.why else null end as why,
      n.visibility, n.existence_visible
    from public.partner_notes n
    where n.about_user_id = _uid and n.deleted_at is null
      and (n.visibility = 'shared' or n.existence_visible = true or public.can_read_note(n.id, _uid))
  ) y;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc), '[]'::jsonb) into _requests
  from (
    select * from public.note_access_requests
    where requester_id = _uid or owner_id = _uid
  ) r;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.granted_at desc), '[]'::jsonb) into _shares
  from (
    select * from public.note_shares where viewer_id = _uid or granted_by = _uid
  ) s;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb) into _exps
  from (
    select e.* from public.note_explanations e
    join public.partner_notes n on n.id = e.note_id
    where n.author_id = _uid or n.about_user_id = _uid
  ) e;

  return jsonb_build_object(
    'my_notes', _my_notes,
    'about_me', _about_me,
    'requests', _requests,
    'shares', _shares,
    'explanations', _exps
  );
end;
$$;

-- 发起申请（access 或 deletion）
create or replace function public.request_partner_note(p_kind text, p_scope text, p_scope_value text, p_message text)
returns jsonb language plpgsql security definer as $$
declare
  _uid uuid := auth.uid();
  _space uuid;
  _owner uuid;
  _req public.note_access_requests;
begin
  if _uid is null then raise exception '请先登录'; end if;
  if p_kind not in ('access','deletion') then raise exception '请求类型不正确'; end if;

  select m.space_id into _space from public.space_members m where m.user_id = _uid limit 1;
  if _space is null then raise exception '你还没有加入空间'; end if;

  select n.author_id into _owner from public.partner_notes n
  where n.space_id = _space and n.about_user_id = _uid and n.deleted_at is null
  order by n.created_at desc limit 1;
  if _owner is null then raise exception '暂时没有关于你的记录'; end if;

  insert into public.note_access_requests (space_id, requester_id, owner_id, kind, scope, scope_value, message)
  values (_space, _uid, _owner, p_kind, coalesce(nullif(p_scope,''),'all'), p_scope_value, p_message)
  returning * into _req;
  return to_jsonb(_req);
end;
$$;

-- 审批（同意/拒绝）；删除请求同意则软删除
create or replace function public.respond_partner_request(p_request_id uuid, p_approve boolean, p_note_ids uuid[], p_expires_days int)
returns jsonb language plpgsql security definer as $$
declare
  _uid uuid := auth.uid();
  _req public.note_access_requests;
  _nid uuid;
  _exp timestamptz;
begin
  if _uid is null then raise exception '请先登录'; end if;

  select * into _req from public.note_access_requests where id = p_request_id;
  if _req.id is null then raise exception '申请不存在'; end if;
  if _req.owner_id <> _uid then raise exception '只有记录者可以审批'; end if;
  if _req.status <> 'pending' then raise exception '这条申请已处理过了'; end if;

  if p_approve then
    if _req.kind = 'deletion' then
      if p_note_ids is null or array_length(p_note_ids, 1) is null then
        update public.partner_notes set deleted_at = now()
        where author_id = _uid and about_user_id = _req.requester_id and deleted_at is null;
      else
        update public.partner_notes set deleted_at = now()
        where author_id = _uid and id = any(p_note_ids);
      end if;
    else
      _exp := case when p_expires_days is null or p_expires_days <= 0 then null
                   else now() + (p_expires_days || ' days')::interval end;
      if p_note_ids is null or array_length(p_note_ids, 1) is null then
        for _nid in
          select n.id from public.partner_notes n
          where n.author_id = _uid and n.about_user_id = _req.requester_id and n.deleted_at is null
            and (_req.scope = 'all'
                 or (_req.scope = 'category' and n.category = _req.scope_value)
                 or (_req.scope = 'note' and n.id::text = _req.scope_value))
        loop
          insert into public.note_shares (note_id, viewer_id, granted_by, expires_at)
          values (_nid, _req.requester_id, _uid, _exp);
        end loop;
      else
        foreach _nid in array p_note_ids loop
          insert into public.note_shares (note_id, viewer_id, granted_by, expires_at)
          select _nid, _req.requester_id, _uid, _exp
          where exists (select 1 from public.partner_notes n where n.id = _nid and n.author_id = _uid);
        end loop;
      end if;
    end if;
    update public.note_access_requests set status = 'approved', responded_at = now() where id = p_request_id;
  else
    update public.note_access_requests set status = 'denied', responded_at = now() where id = p_request_id;
  end if;

  return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'denied' end);
end;
$$;

-- 撤销授权
create or replace function public.revoke_partner_share(p_share_id uuid)
returns jsonb language plpgsql security definer as $$
declare _uid uuid := auth.uid();
begin
  update public.note_shares s set revoked_at = now()
  where s.id = p_share_id
    and exists (select 1 from public.partner_notes n where n.id = s.note_id and n.author_id = _uid);
  return jsonb_build_object('ok', true);
end;
$$;

-- 被记录者添加说明
create or replace function public.add_note_explanation(p_note_id uuid, p_text text)
returns jsonb language plpgsql security definer as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception '请先登录'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception '说明不能为空'; end if;
  if not exists (select 1 from public.partner_notes n where n.id = p_note_id and n.about_user_id = _uid) then
    raise exception '只能对自己相关的记录添加说明';
  end if;
  insert into public.note_explanations (note_id, author_id, text) values (p_note_id, _uid, trim(p_text));
  return jsonb_build_object('ok', true);
end;
$$;

-- 记录查看日志
create or replace function public.log_note_view(p_note_id uuid)
returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then return; end if;
  if public.can_read_note(p_note_id, auth.uid()) then
    insert into public.note_view_logs (note_id, viewer_id) values (p_note_id, auth.uid());
  end if;
end;
$$;

grant select, insert, update, delete on public.partner_notes, public.note_shares,
  public.note_access_requests, public.note_explanations, public.note_view_logs to authenticated;
