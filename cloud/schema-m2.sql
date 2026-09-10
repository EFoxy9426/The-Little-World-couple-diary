-- ============================================================
-- 小小世界 云端版 M2：内容数据上云（点滴/愿望/悄悄话/纪念日）
-- 在 SQL Editor 再执行一次。所有表都带 space_id + RLS，只允许本空间成员访问。
-- ============================================================

-- 点滴
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  record_date date not null,
  text text not null default '',
  mood text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.memory_photos (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  storage_path text not null,
  sort int not null default 0
);
create table if not exists public.memory_comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  text text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.memory_likes (
  memory_id uuid not null references public.memories(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (memory_id, user_id)
);

-- 愿望
create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  text text not null,
  cat text not null default '其他',
  wish_date date not null,
  status text not null default 'open' check (status in ('open','done','gaveup')),
  done_date date,
  gaveup_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.wish_photos (
  id uuid primary key default gen_random_uuid(),
  wish_id uuid not null references public.wishes(id) on delete cascade,
  storage_path text not null,
  sort int not null default 0
);

-- 悄悄话
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  author uuid not null references auth.users(id),
  text text not null,
  at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  author uuid not null references auth.users(id),
  text text not null,
  at timestamptz not null default now()
);

-- 纪念日
create table if not exists public.anniversaries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  name text not null,
  date date not null,
  repeat boolean not null default true,
  emoji text not null default '📌',
  color text,
  created_at timestamptz not null default now()
);

-- ============ RLS ============
alter table public.memories enable row level security;
alter table public.memory_photos enable row level security;
alter table public.memory_comments enable row level security;
alter table public.memory_likes enable row level security;
alter table public.wishes enable row level security;
alter table public.wish_photos enable row level security;
alter table public.notes enable row level security;
alter table public.note_replies enable row level security;
alter table public.anniversaries enable row level security;

-- 成员策略：子表通过父表校验（子表本身不带 space_id，用 exists 走父表）
create policy "mem select" on public.memories for select
  using (public.is_space_member(space_id, auth.uid()));
create policy "mem insert" on public.memories for insert
  with check (public.is_space_member(space_id, auth.uid()));
create policy "mem update" on public.memories for update
  using (public.is_space_member(space_id, auth.uid()));
create policy "mem delete" on public.memories for delete
  using (public.is_space_member(space_id, auth.uid()));

create policy "mp select" on public.memory_photos for select
  using (exists (select 1 from public.memories m where m.id = memory_id and public.is_space_member(m.space_id, auth.uid())));
create policy "mp insert" on public.memory_photos for insert
  with check (exists (select 1 from public.memories m where m.id = memory_id and public.is_space_member(m.space_id, auth.uid())));
create policy "mp delete" on public.memory_photos for delete
  using (exists (select 1 from public.memories m where m.id = memory_id and public.is_space_member(m.space_id, auth.uid())));

create policy "mc select" on public.memory_comments for select
  using (exists (select 1 from public.memories m where m.id = memory_id and public.is_space_member(m.space_id, auth.uid())));
create policy "mc insert" on public.memory_comments for insert
  with check (exists (select 1 from public.memories m where m.id = memory_id and public.is_space_member(m.space_id, auth.uid())));
create policy "mc delete" on public.memory_comments for delete
  using (exists (select 1 from public.memories m where m.id = memory_id and public.is_space_member(m.space_id, auth.uid())));

create policy "ml select" on public.memory_likes for select
  using (exists (select 1 from public.memories m where m.id = memory_id and public.is_space_member(m.space_id, auth.uid())));
create policy "ml insert" on public.memory_likes for insert
  with check (exists (select 1 from public.memories m where m.id = memory_id and public.is_space_member(m.space_id, auth.uid())));
create policy "ml delete" on public.memory_likes for delete
  using (exists (select 1 from public.memories m where m.id = memory_id and public.is_space_member(m.space_id, auth.uid())));

create policy "w select" on public.wishes for select
  using (public.is_space_member(space_id, auth.uid()));
create policy "w insert" on public.wishes for insert
  with check (public.is_space_member(space_id, auth.uid()));
create policy "w update" on public.wishes for update
  using (public.is_space_member(space_id, auth.uid()));
create policy "w delete" on public.wishes for delete
  using (public.is_space_member(space_id, auth.uid()));

create policy "wp select" on public.wish_photos for select
  using (exists (select 1 from public.wishes w where w.id = wish_id and public.is_space_member(w.space_id, auth.uid())));
create policy "wp insert" on public.wish_photos for insert
  with check (exists (select 1 from public.wishes w where w.id = wish_id and public.is_space_member(w.space_id, auth.uid())));
create policy "wp delete" on public.wish_photos for delete
  using (exists (select 1 from public.wishes w where w.id = wish_id and public.is_space_member(w.space_id, auth.uid())));

create policy "n select" on public.notes for select
  using (public.is_space_member(space_id, auth.uid()));
create policy "n insert" on public.notes for insert
  with check (public.is_space_member(space_id, auth.uid()));
create policy "n update" on public.notes for update
  using (public.is_space_member(space_id, auth.uid()));
create policy "n delete" on public.notes for delete
  using (public.is_space_member(space_id, auth.uid()));

create policy "nr select" on public.note_replies for select
  using (exists (select 1 from public.notes n where n.id = note_id and public.is_space_member(n.space_id, auth.uid())));
create policy "nr insert" on public.note_replies for insert
  with check (exists (select 1 from public.notes n where n.id = note_id and public.is_space_member(n.space_id, auth.uid())));
create policy "nr delete" on public.note_replies for delete
  using (exists (select 1 from public.notes n where n.id = note_id and public.is_space_member(n.space_id, auth.uid())));

create policy "a select" on public.anniversaries for select
  using (public.is_space_member(space_id, auth.uid()));
create policy "a insert" on public.anniversaries for insert
  with check (public.is_space_member(space_id, auth.uid()));
create policy "a update" on public.anniversaries for update
  using (public.is_space_member(space_id, auth.uid()));
create policy "a delete" on public.anniversaries for delete
  using (public.is_space_member(space_id, auth.uid()));

-- 权限：只有登录用户可操作（成员校验交给上面的 RLS）
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.spaces, public.space_members,
  public.memories, public.memory_photos, public.memory_comments, public.memory_likes,
  public.wishes, public.wish_photos, public.notes, public.note_replies,
  public.anniversaries to authenticated;
