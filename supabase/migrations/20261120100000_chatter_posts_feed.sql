create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);

alter table public.posts enable row level security;
grant select, insert, update, delete on public.posts to authenticated;

drop policy if exists "Signed-in members can read posts" on public.posts;
create policy "Signed-in members can read posts"
  on public.posts for select to authenticated
  using (true);

drop policy if exists "Members can create posts as themselves" on public.posts;
create policy "Members can create posts as themselves"
  on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists "Authors can update their own posts" on public.posts;
create policy "Authors can update their own posts"
  on public.posts for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists "Authors can delete their own posts" on public.posts;
create policy "Authors can delete their own posts"
  on public.posts for delete to authenticated
  using (author_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;