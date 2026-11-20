-- Chatter social interactions, threaded replies, custom role badges, and personal emoji.
alter table public.messages add column if not exists reply_to_message_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists mentions uuid[] not null default '{}';
alter table public.posts add column if not exists mentions uuid[] not null default '{}';
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, parent_id uuid references public.post_comments(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000), mentions uuid[] not null default '{}', created_at timestamptz not null default now()
);
create index if not exists post_comments_post_created_idx on public.post_comments(post_id, created_at);
create table if not exists public.post_likes (post_id uuid not null references public.posts(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id,user_id));
create table if not exists public.post_reposts (post_id uuid not null references public.posts(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id,user_id));
create table if not exists public.chatter_roles (id uuid primary key default gen_random_uuid(), name text not null unique check (char_length(name) between 1 and 32), badge text not null default '✦' check (char_length(badge) between 1 and 8), color text not null default '#A3E6D3' check (color ~ '^#[0-9A-Fa-f]{6}$'), created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now());
create table if not exists public.profile_roles (user_id uuid not null references public.profiles(id) on delete cascade, role_id uuid not null references public.chatter_roles(id) on delete cascade, assigned_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), primary key (user_id,role_id));
create index if not exists profile_roles_user_idx on public.profile_roles(user_id);
create table if not exists public.user_custom_emojis (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade, shortcode text not null check (shortcode ~ '^[a-z0-9_]{2,24}$'), emoji text not null check (char_length(emoji) between 1 and 12), created_at timestamptz not null default now(), unique (owner_id,shortcode));
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_reposts enable row level security;
alter table public.chatter_roles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.user_custom_emojis enable row level security;
drop policy if exists "Members can read post comments" on public.post_comments;
create policy "Members can read post comments" on public.post_comments for select to authenticated using (true);
drop policy if exists "Members can create their own post comments" on public.post_comments;
create policy "Members can create their own post comments" on public.post_comments for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Authors can update their own post comments" on public.post_comments;
create policy "Authors can update their own post comments" on public.post_comments for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Authors can delete their own post comments" on public.post_comments;
create policy "Authors can delete their own post comments" on public.post_comments for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Members can read post likes" on public.post_likes;
create policy "Members can read post likes" on public.post_likes for select to authenticated using (true);
drop policy if exists "Members can like as themselves" on public.post_likes;
create policy "Members can like as themselves" on public.post_likes for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Members can remove their own likes" on public.post_likes;
create policy "Members can remove their own likes" on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Members can read reposts" on public.post_reposts;
create policy "Members can read reposts" on public.post_reposts for select to authenticated using (true);
drop policy if exists "Members can repost as themselves" on public.post_reposts;
create policy "Members can repost as themselves" on public.post_reposts for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Members can remove their own reposts" on public.post_reposts;
create policy "Members can remove their own reposts" on public.post_reposts for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Members can read custom roles" on public.chatter_roles;
create policy "Members can read custom roles" on public.chatter_roles for select to authenticated using (true);
drop policy if exists "Admins manage custom roles" on public.chatter_roles;
create policy "Admins manage custom roles" on public.chatter_roles for all to authenticated using (exists (select 1 from public.chatter_admins a where a.user_id = (select auth.uid()))) with check (exists (select 1 from public.chatter_admins a where a.user_id = (select auth.uid())));
drop policy if exists "Members can read assigned role badges" on public.profile_roles;
create policy "Members can read assigned role badges" on public.profile_roles for select to authenticated using (true);
drop policy if exists "Admins manage assigned role badges" on public.profile_roles;
create policy "Admins manage assigned role badges" on public.profile_roles for all to authenticated using (exists (select 1 from public.chatter_admins a where a.user_id = (select auth.uid()))) with check (exists (select 1 from public.chatter_admins a where a.user_id = (select auth.uid())));
drop policy if exists "Members manage their own custom emojis" on public.user_custom_emojis;
create policy "Members manage their own custom emojis" on public.user_custom_emojis for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.post_comments to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.post_reposts to authenticated;
grant select, insert, update, delete on public.chatter_roles to authenticated;
grant select, insert, delete on public.profile_roles to authenticated;
grant select, insert, delete on public.user_custom_emojis to authenticated;
