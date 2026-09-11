-- ============================================================
-- TA 的小本本 · 备份支持：导出 / 导入 / 清空
-- 在 Supabase SQL Editor 整段执行一次
-- ============================================================

create or replace function public.partner_notebook_export()
returns jsonb language plpgsql security definer as $$
declare _uid uuid := auth.uid(); _space uuid;
begin
  if _uid is null then raise exception '请先登录'; end if;
  select m.space_id into _space from public.space_members m where m.user_id = _uid limit 1;
  if _space is null then return null; end if;
  return jsonb_build_object(
    'notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.partner_notes n where n.space_id = _space), '[]'::jsonb),
    'shares', coalesce((select jsonb_agg(to_jsonb(s)) from public.note_shares s join public.partner_notes n on n.id = s.note_id where n.space_id = _space), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r)) from public.note_access_requests r where r.space_id = _space), '[]'::jsonb),
    'explanations', coalesce((select jsonb_agg(to_jsonb(e)) from public.note_explanations e join public.partner_notes n on n.id = e.note_id where n.space_id = _space), '[]'::jsonb),
    'logs', coalesce((select jsonb_agg(to_jsonb(l)) from public.note_view_logs l join public.partner_notes n on n.id = l.note_id where n.space_id = _space), '[]'::jsonb)
  );
end;
$$;

create or replace function public.partner_notebook_clear()
returns jsonb language plpgsql security definer as $$
declare _uid uuid := auth.uid(); _space uuid;
begin
  if _uid is null then raise exception '请先登录'; end if;
  select m.space_id into _space from public.space_members m where m.user_id = _uid limit 1;
  if _space is null then return jsonb_build_object('ok', false); end if;
  delete from public.partner_notes where space_id = _space;
  delete from public.note_access_requests where space_id = _space;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.partner_notebook_import(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare
  _uid uuid := auth.uid();
  _space uuid;
  _other uuid;
  _n jsonb;
  _id uuid;
  _author uuid;
  _about uuid;
begin
  if _uid is null then raise exception '请先登录'; end if;
  select m.space_id into _space from public.space_members m where m.user_id = _uid limit 1;
  if _space is null then raise exception '你还没有加入空间'; end if;
  select m.user_id into _other from public.space_members m where m.space_id = _space and m.user_id <> _uid limit 1;

  delete from public.partner_notes where space_id = _space;
  delete from public.note_access_requests where space_id = _space;

  for _n in select * from jsonb_array_elements(coalesce(p_payload->'notes','[]'::jsonb)) loop
    _id := (_n->>'id')::uuid;
    _author := (_n->>'author_id')::uuid;
    _about := (_n->>'about_user_id')::uuid;
    if _author <> _uid and _author <> coalesce(_other, _uid) then _author := coalesce(_other, _uid); end if;
    if _about <> _uid and _about <> coalesce(_other, _uid) then _about := _uid; end if;
    insert into public.partner_notes (id, space_id, author_id, about_user_id, category, text, why, visibility, existence_visible, created_at, updated_at, deleted_at)
    values (_id, _space, _author, _about, coalesce(_n->>'category','其他'), coalesce(_n->>'text',''), _n->>'why',
            coalesce(_n->>'visibility','requestable'), coalesce((_n->>'existence_visible')::boolean, true),
            coalesce((_n->>'created_at')::timestamptz, now()), coalesce((_n->>'updated_at')::timestamptz, now()),
            (_n->>'deleted_at')::timestamptz)
    on conflict (id) do nothing;
  end loop;

  for _n in select * from jsonb_array_elements(coalesce(p_payload->'shares','[]'::jsonb)) loop
    insert into public.note_shares (id, note_id, viewer_id, granted_by, can_comment, granted_at, expires_at, revoked_at)
    select (_n->>'id')::uuid, (_n->>'note_id')::uuid, (_n->>'viewer_id')::uuid, (_n->>'granted_by')::uuid,
           coalesce((_n->>'can_comment')::boolean,false), coalesce((_n->>'granted_at')::timestamptz, now()),
           (_n->>'expires_at')::timestamptz, (_n->>'revoked_at')::timestamptz
    where exists (select 1 from public.partner_notes n where n.id = (_n->>'note_id')::uuid and n.space_id = _space)
    on conflict (id) do nothing;
  end loop;

  for _n in select * from jsonb_array_elements(coalesce(p_payload->'requests','[]'::jsonb)) loop
    insert into public.note_access_requests (id, space_id, requester_id, owner_id, kind, scope, scope_value, message, status, created_at, responded_at)
    values ((_n->>'id')::uuid, _space, (_n->>'requester_id')::uuid, (_n->>'owner_id')::uuid,
            coalesce(_n->>'kind','access'), coalesce(_n->>'scope','note'), _n->>'scope_value', _n->>'message',
            coalesce(_n->>'status','pending'), coalesce((_n->>'created_at')::timestamptz, now()), (_n->>'responded_at')::timestamptz)
    on conflict (id) do nothing;
  end loop;

  for _n in select * from jsonb_array_elements(coalesce(p_payload->'explanations','[]'::jsonb)) loop
    insert into public.note_explanations (id, note_id, author_id, text, created_at)
    select (_n->>'id')::uuid, (_n->>'note_id')::uuid, (_n->>'author_id')::uuid, coalesce(_n->>'text',''), coalesce((_n->>'created_at')::timestamptz, now())
    where exists (select 1 from public.partner_notes n where n.id = (_n->>'note_id')::uuid and n.space_id = _space)
    on conflict (id) do nothing;
  end loop;

  for _n in select * from jsonb_array_elements(coalesce(p_payload->'logs','[]'::jsonb)) loop
    insert into public.note_view_logs (id, note_id, viewer_id, viewed_at)
    select (_n->>'id')::uuid, (_n->>'note_id')::uuid, (_n->>'viewer_id')::uuid, coalesce((_n->>'viewed_at')::timestamptz, now())
    where exists (select 1 from public.partner_notes n where n.id = (_n->>'note_id')::uuid and n.space_id = _space)
    on conflict (id) do nothing;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;
