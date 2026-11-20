-- CHATTER | Supabase schema
-- Run once in Supabase Dashboard > SQL Editor for a new project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'New member' check (char_length(display_name) between 1 and 32),
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  bio text not null default '' check (char_length(bio) <= 100),
  avatar_url text,
  banner_url text,
  username_color text not null default '#A3E6D3' check (username_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references public.profiles(id) on delete cascade,
  user_two uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_two_distinct_users check (user_one < user_two),
  constraint conversations_unique_pair unique (user_one, user_two)
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  attachment_url text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);\ncreate index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);\ncreate index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id, conversation_id);
create index if not exists conversations_updated_idx on public.conversations (updated_at desc);

-- Automatically create the profile at sign-up. Metadata is display data only.
create or replace function public.handle_new_chatter_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_name text;
  requested_username text;
  safe_username text;
begin
  requested_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'member'), '@', 1));
  requested_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, 'member'), '@', 1)), '[^a-zA-Z0-9_]', '', 'g'));
  requested_username := left(requested_username, 16);
  if char_length(requested_username) < 3 then requested_username := 'member'; end if;
  safe_username := requested_username;
  if exists (select 1 from public.profiles p where p.username = safe_username) then
    safe_username := left(requested_username, 16) || '_' || left(replace(new.id::text, '-', ''), 7);
  end if;
  insert into public.profiles (id, display_name, username)
  values (new.id, left(requested_name, 32), safe_username)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_chatter_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_chatter on auth.users;
create trigger on_auth_user_created_chatter after insert on auth.users
for each row execute procedure public.handle_new_chatter_user();

-- Update conversation activity whenever a message arrives.
create or replace function public.touch_chatter_conversation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists on_chatter_message_created on public.messages;
create trigger on_chatter_message_created after insert on public.messages
for each row execute procedure public.touch_chatter_conversation();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;\nalter table public.posts enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;\ngrant select, insert, update, delete on public.posts to authenticated;

-- Profiles: discoverable to signed-in members; editable only by their owner.
drop policy if exists "Profiles readable by signed-in members" on public.profiles;
create policy "Profiles readable by signed-in members" on public.profiles for select to authenticated using (true);
drop policy if exists "Members can create their own profile" on public.profiles;
create policy "Members can create their own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "Members can update their own profile" on public.profiles;
create policy "Members can update their own profile" on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Community posts are readable by signed-in members and writable only by their author.
drop policy if exists "Signed-in members can read posts" on public.posts;
create policy "Signed-in members can read posts" on public.posts for select to authenticated using (true);
drop policy if exists "Members can create posts as themselves" on public.posts;
create policy "Members can create posts as themselves" on public.posts for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists "Authors can update their own posts" on public.posts;
create policy "Authors can update their own posts" on public.posts for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists "Authors can delete their own posts" on public.posts;
create policy "Authors can delete their own posts" on public.posts for delete to authenticated using (author_id = (select auth.uid()));

-- A participant may change activity metadata, but cannot swap either participant.
create or replace function public.prevent_chatter_participant_swap()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_one is distinct from old.user_one or new.user_two is distinct from old.user_two then
    raise exception 'Conversation participants are immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_chatter_participant_swap on public.conversations;
create trigger prevent_chatter_participant_swap before update on public.conversations
for each row execute procedure public.prevent_chatter_participant_swap();

-- A direct conversation is a unique, sorted pair.
drop policy if exists "Members can read their conversations" on public.conversations;
create policy "Members can read their conversations" on public.conversations for select to authenticated
using ((select auth.uid()) in (user_one, user_two));
drop policy if exists "Members can create a conversation they belong to" on public.conversations;
create policy "Members can create a conversation they belong to" on public.conversations for insert to authenticated
with check ((select auth.uid()) in (user_one, user_two));
drop policy if exists "Members can update their conversations" on public.conversations;
create policy "Members can update their conversations" on public.conversations for update to authenticated
using ((select auth.uid()) in (user_one, user_two)) with check ((select auth.uid()) in (user_one, user_two));

-- Participants may create membership rows only for the two IDs on that conversation.
drop policy if exists "Members can view conversation membership" on public.conversation_members;
create policy "Members can view conversation membership" on public.conversation_members for select to authenticated
using (exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)));
drop policy if exists "Participants can add conversation members" on public.conversation_members;
create policy "Participants can add conversation members" on public.conversation_members for insert to authenticated
with check (exists (select 1 from public.conversations c where c.id = conversation_id
  and (select auth.uid()) in (c.user_one, c.user_two) and user_id in (c.user_one, c.user_two)));
drop policy if exists "Members can update their own read position" on public.conversation_members;
create policy "Members can update their own read position" on public.conversation_members for update to authenticated
using ((select auth.uid()) = user_id and exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)))
with check ((select auth.uid()) = user_id and exists (
  select 1 from public.conversations c
  where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)
));

-- Messages: only participants can read; authenticated senders can write as themselves.
drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages" on public.messages for select to authenticated
using (exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)));
drop policy if exists "Participants can send messages as themselves" on public.messages;
create policy "Participants can send messages as themselves" on public.messages for insert to authenticated
with check (sender_id = (select auth.uid()) and exists (select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)));
drop policy if exists "Senders can update their own messages" on public.messages;
create policy "Senders can update their own messages" on public.messages for update to authenticated
using (sender_id = (select auth.uid()) and exists (
  select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)
))
with check (sender_id = (select auth.uid()) and exists (
  select 1 from public.conversations c where c.id = conversation_id and (select auth.uid()) in (c.user_one, c.user_two)
));
drop policy if exists "Senders can delete their own messages" on public.messages;
create policy "Senders can delete their own messages" on public.messages for delete to authenticated using (sender_id = (select auth.uid()));

-- Public images only; uploads are allowed only inside the signed-in user's own UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Users upload their own profile media" on storage.objects;
create policy "Users upload their own profile media" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Enable Realtime for messages and inbox membership refreshes.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members') then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts') then
    alter publication supabase_realtime add table public.posts;
  end if;
end $;

-- Chat attachments (5 MB per file). Keep this bucket public for direct image/video previews.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf','text/plain'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Users upload their own chat media" on storage.objects;
create policy "Users upload their own chat media" on storage.objects for insert to authenticated
with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.conversations c where c.id::text = (storage.foldername(name))[2] and (select auth.uid()) in (c.user_one,c.user_two)));
drop policy if exists "Chat media is publicly readable" on storage.objects;
drop policy if exists "Participants can read chat media" on storage.objects;
create policy "Participants can read chat media" on storage.objects for select to authenticated using (
  bucket_id = 'chat-media' and exists (
    select 1 from public.conversations c where c.id::text = (storage.foldername(name))[2]
      and (select auth.uid()) in (c.user_one,c.user_two)
  )
);
