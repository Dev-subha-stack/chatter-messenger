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
  chat_background text not null default 'default' check (chat_background in ('default','midnight','forest','dusk','rose','paper','custom')),
  chat_background_path text,
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
  content text not null default '' check (char_length(content) between 0 and 1000),
  media_path text,
  media_type text,
  media_name text,
  media_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_content_or_media_check check (char_length(content) > 0 or media_path is not null)
);

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
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
alter table public.messages enable row level security;
alter table public.posts enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.posts to authenticated;

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

-- Post uploads are private and can only be attached to readable community posts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media','post-media',false,31457280,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Post authors can upload their own media" on storage.objects;
create policy "Post authors can upload their own media" on storage.objects for insert to authenticated with check (bucket_id='post-media' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Members can read media attached to posts" on storage.objects;
create policy "Members can read media attached to posts" on storage.objects for select to authenticated using (bucket_id='post-media' and exists (select 1 from public.posts p where p.media_path=storage.objects.name));
drop policy if exists "Post authors can delete their own media" on storage.objects;
create policy "Post authors can delete their own media" on storage.objects for delete to authenticated using (bucket_id='post-media' and exists (select 1 from public.posts p where p.media_path=storage.objects.name and p.author_id=(select auth.uid())));

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
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $;

-- Chat attachments (5 MB per file). Private media is visible only to conversation participants.
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

-- In-app notifications for @mentions.
create table if not exists public.chatter_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (notification_type in ('message_mention','post_mention','comment_mention')),
  target_type text not null check (target_type in ('conversation','post')),
  target_id uuid not null,
  body text not null check (char_length(body) between 1 and 240),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chatter_notifications_inbox_idx on public.chatter_notifications(recipient_user_id, created_at desc);
alter table public.chatter_notifications enable row level security;
drop policy if exists "Members can read notifications addressed to them" on public.chatter_notifications;
create policy "Members can read notifications addressed to them" on public.chatter_notifications for select to authenticated using (recipient_user_id = (select auth.uid()));
drop policy if exists "Members can send mention notifications as themselves" on public.chatter_notifications;
create policy "Members can send mention notifications as themselves" on public.chatter_notifications for insert to authenticated with check (actor_user_id = (select auth.uid()) and recipient_user_id <> (select auth.uid()));
drop policy if exists "Members can mark their own notifications" on public.chatter_notifications;
create policy "Members can mark their own notifications" on public.chatter_notifications for update to authenticated using (recipient_user_id = (select auth.uid())) with check (recipient_user_id = (select auth.uid()));
drop policy if exists "Members can delete their own notifications" on public.chatter_notifications;
create policy "Members can delete their own notifications" on public.chatter_notifications for delete to authenticated using (recipient_user_id = (select auth.uid()));
grant select, insert, update, delete on public.chatter_notifications to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chatter_notifications'
  ) then
    alter publication supabase_realtime add table public.chatter_notifications;
  end if;
end $$;
 
-- Chatter linked profiles, follows, complete reply previews and shared custom emoji images.
alter table public.profiles add column if not exists bio_links text[] not null default '{}';
alter table public.messages
  add column if not exists reply_to_sender_id uuid references public.profiles(id) on delete set null,
  add column if not exists reply_to_content text;
alter table public.user_custom_emojis add column if not exists image_path text;

create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint user_follows_no_self_follow check (follower_id <> following_id)
);
create index if not exists user_follows_following_idx on public.user_follows(following_id, created_at desc);
create index if not exists user_follows_follower_idx on public.user_follows(follower_id, created_at desc);
alter table public.user_follows enable row level security;
drop policy if exists "Members can view follow relationships" on public.user_follows;
create policy "Members can view follow relationships" on public.user_follows for select to authenticated using (true);
drop policy if exists "Members can follow as themselves" on public.user_follows;
create policy "Members can follow as themselves" on public.user_follows for insert to authenticated with check (follower_id = (select auth.uid()) and follower_id <> following_id);
drop policy if exists "Members can unfollow as themselves" on public.user_follows;
create policy "Members can unfollow as themselves" on public.user_follows for delete to authenticated using (follower_id = (select auth.uid()));
grant select, insert, delete on public.user_follows to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('custom-emojis','custom-emojis',true,524288,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Members can read shared custom emojis" on public.user_custom_emojis;
create policy "Members can read shared custom emojis" on public.user_custom_emojis for select to authenticated using (true);
drop policy if exists "Members upload their own emoji images" on storage.objects;
create policy "Members upload their own emoji images" on storage.objects for insert to authenticated with check (bucket_id='custom-emojis' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Members delete their own emoji images" on storage.objects;
create policy "Members delete their own emoji images" on storage.objects for delete to authenticated using (bucket_id='custom-emojis' and (storage.foldername(name))[1]=(select auth.uid())::text);

alter table public.chatter_notifications drop constraint if exists chatter_notifications_notification_type_check;
alter table public.chatter_notifications add constraint chatter_notifications_notification_type_check check (notification_type in ('message_mention','post_mention','comment_mention','new_message','new_follower'));
alter table public.chatter_notifications drop constraint if exists chatter_notifications_target_type_check;
alter table public.chatter_notifications add constraint chatter_notifications_target_type_check check (target_type in ('conversation','post','profile'));

create unique index if not exists user_custom_emojis_shortcode_global_uidx
  on public.user_custom_emojis(shortcode);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_follows'::regclass
      and conname = 'user_follows_no_self_follow'
  ) then
    alter table public.user_follows
      add constraint user_follows_no_self_follow check (follower_id <> following_id);
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_custom_emojis'
  ) then
    alter publication supabase_realtime add table public.user_custom_emojis;
  end if;
end $$;

-- Additional profile customisations.
alter table public.profiles
  add column if not exists profile_status text not null default '',
  add column if not exists profile_theme_color text not null default '#A3E6D3';
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_profile_status_length_check') then
    alter table public.profiles add constraint profiles_profile_status_length_check check (char_length(profile_status) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_profile_theme_color_check') then
    alter table public.profiles add constraint profiles_profile_theme_color_check check (profile_theme_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

-- Chatter: comment likes, message reactions and interactive polls.
create table if not exists public.post_comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id,user_id)
);
alter table public.post_comment_likes enable row level security;
drop policy if exists "Members can read comment likes" on public.post_comment_likes;
create policy "Members can read comment likes" on public.post_comment_likes for select to authenticated using (true);
drop policy if exists "Members can like comments as themselves" on public.post_comment_likes;
create policy "Members can like comments as themselves" on public.post_comment_likes for insert to authenticated
with check (user_id=(select auth.uid()) and exists (select 1 from public.post_comments c where c.id=comment_id));
drop policy if exists "Members can remove their own comment likes" on public.post_comment_likes;
create policy "Members can remove their own comment likes" on public.post_comment_likes for delete to authenticated using (user_id=(select auth.uid()));
grant select,insert,delete on public.post_comment_likes to authenticated;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 12),
  created_at timestamptz not null default now(),
  primary key (message_id,user_id,emoji)
);
create index if not exists message_reactions_message_idx on public.message_reactions(message_id);
alter table public.message_reactions enable row level security;
drop policy if exists "Conversation members can read message reactions" on public.message_reactions;
create policy "Conversation members can read message reactions" on public.message_reactions for select to authenticated
using (exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=message_id and (select auth.uid()) in (c.user_one,c.user_two)));
drop policy if exists "Members can react as themselves" on public.message_reactions;
create policy "Members can react as themselves" on public.message_reactions for insert to authenticated
with check (user_id=(select auth.uid()) and exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=message_id and (select auth.uid()) in (c.user_one,c.user_two)));
drop policy if exists "Members can remove their reactions" on public.message_reactions;
create policy "Members can remove their reactions" on public.message_reactions for delete to authenticated
using (user_id=(select auth.uid()) and exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=message_id and (select auth.uid()) in (c.user_one,c.user_two)));
grant select,insert,delete on public.message_reactions to authenticated;

create table if not exists public.chatter_polls (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','message')),
  target_id uuid not null,
  question text not null check (char_length(question) between 1 and 180),
  allow_multiple boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  unique (target_type,target_id)
);
create index if not exists chatter_polls_target_idx on public.chatter_polls(target_type,target_id);
create table if not exists public.chatter_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chatter_polls(id) on delete cascade,
  option_text text not null check (char_length(option_text) between 1 and 100),
  position integer not null default 0,
  unique (id,poll_id),
  unique (poll_id,position)
);
create table if not exists public.chatter_poll_votes (
  poll_id uuid not null references public.chatter_polls(id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id,option_id,user_id),
  foreign key (option_id,poll_id) references public.chatter_poll_options(id,poll_id) on delete cascade
);
create index if not exists chatter_poll_votes_poll_idx on public.chatter_poll_votes(poll_id);
alter table public.chatter_polls enable row level security;
alter table public.chatter_poll_options enable row level security;
alter table public.chatter_poll_votes enable row level security;
drop policy if exists "Members can read visible polls" on public.chatter_polls;
create policy "Members can read visible polls" on public.chatter_polls for select to authenticated using (
  (target_type='post' and exists (select 1 from public.posts p where p.id=target_id))
  or (target_type='message' and exists (select 1 from public.messages m join public.conversations c on c.id=m.conversation_id where m.id=target_id and (select auth.uid()) in (c.user_one,c.user_two)))
);
drop policy if exists "Authors can create polls on their content" on public.chatter_polls;
create policy "Authors can create polls on their content" on public.chatter_polls for insert to authenticated with check (
  creator_id=(select auth.uid()) and (
    (target_type='post' and exists (select 1 from public.posts p where p.id=target_id and p.author_id=(select auth.uid())))
    or (target_type='message' and exists (select 1 from public.messages m where m.id=target_id and m.sender_id=(select auth.uid())))
  )
);
drop policy if exists "Creators can delete their polls" on public.chatter_polls;
create policy "Creators can delete their polls" on public.chatter_polls for delete to authenticated using (creator_id=(select auth.uid()));
drop policy if exists "Members can read visible poll options" on public.chatter_poll_options;
create policy "Members can read visible poll options" on public.chatter_poll_options for select to authenticated using (exists (select 1 from public.chatter_polls p where p.id=poll_id));
drop policy if exists "Poll creators can add options" on public.chatter_poll_options;
create policy "Poll creators can add options" on public.chatter_poll_options for insert to authenticated with check (exists (select 1 from public.chatter_polls p where p.id=poll_id and p.creator_id=(select auth.uid())));
drop policy if exists "Poll creators can delete options" on public.chatter_poll_options;
create policy "Poll creators can delete options" on public.chatter_poll_options for delete to authenticated using (exists (select 1 from public.chatter_polls p where p.id=poll_id and p.creator_id=(select auth.uid())));
drop policy if exists "Members can read visible poll votes" on public.chatter_poll_votes;
create policy "Members can read visible poll votes" on public.chatter_poll_votes for select to authenticated using (exists (select 1 from public.chatter_polls p where p.id=poll_id));
grant select,insert,delete on public.chatter_polls to authenticated;
grant select,insert,delete on public.chatter_poll_options to authenticated;
grant select on public.chatter_poll_votes to authenticated;

create or replace function public.toggle_chatter_poll_vote(p_poll_id uuid,p_option_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  voter uuid := auth.uid();
  selected_poll public.chatter_polls%rowtype;
  already_selected boolean;
begin
  if voter is null then raise exception 'Sign in to vote'; end if;
  select * into selected_poll from public.chatter_polls where id=p_poll_id for update;
  if not found then raise exception 'Poll not found'; end if;
  if selected_poll.closes_at is not null and selected_poll.closes_at<=now() then raise exception 'This poll has closed'; end if;
  if selected_poll.target_type='message' and not exists (
    select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
    where m.id=selected_poll.target_id and voter in (c.user_one,c.user_two)
  ) then raise exception 'You cannot vote in this poll'; end if;
  if selected_poll.target_type='post' and not exists (select 1 from public.posts p where p.id=selected_poll.target_id) then raise exception 'Post not found'; end if;
  if not exists (select 1 from public.chatter_poll_options o where o.id=p_option_id and o.poll_id=p_poll_id) then raise exception 'Invalid poll option'; end if;
  select exists(select 1 from public.chatter_poll_votes v where v.poll_id=p_poll_id and v.option_id=p_option_id and v.user_id=voter) into already_selected;
  if selected_poll.allow_multiple then
    if already_selected then delete from public.chatter_poll_votes where poll_id=p_poll_id and option_id=p_option_id and user_id=voter;
    else insert into public.chatter_poll_votes(poll_id,option_id,user_id) values(p_poll_id,p_option_id,voter) on conflict do nothing; end if;
  else
    delete from public.chatter_poll_votes where poll_id=p_poll_id and user_id=voter;
    if not already_selected then insert into public.chatter_poll_votes(poll_id,option_id,user_id) values(p_poll_id,p_option_id,voter) on conflict do nothing; end if;
  end if;
end;
$$;
revoke all on function public.toggle_chatter_poll_vote(uuid,uuid) from public,anon;
grant execute on function public.toggle_chatter_poll_vote(uuid,uuid) to authenticated;

alter table public.posts add column if not exists poll_id uuid references public.chatter_polls(id) on delete set null;
alter table public.messages add column if not exists poll_id uuid references public.chatter_polls(id) on delete set null;
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='message_reactions') then alter publication supabase_realtime add table public.message_reactions; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='post_comment_likes') then alter publication supabase_realtime add table public.post_comment_likes; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chatter_poll_votes') then alter publication supabase_realtime add table public.chatter_poll_votes; end if;
  end if;
end $$;


-- Keep reply previews complete for both new and existing chat messages.
create or replace function public.fill_message_reply_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
declare original_message public.messages%rowtype;
begin
  if new.reply_to_message_id is null then
    new.reply_to_sender_id := null;
    new.reply_to_content := null;
    return new;
  end if;
  select * into original_message from public.messages
   where id = new.reply_to_message_id and conversation_id = new.conversation_id;
  if found then
    new.reply_to_sender_id := original_message.sender_id;
    new.reply_to_content := case
      when original_message.deleted_at is not null then 'This message was deleted'
      else coalesce(nullif(btrim(original_message.content),''),nullif(btrim(original_message.attachment_name),''),
        case when original_message.attachment_type like 'image/%' then 'Photo'
             when original_message.attachment_type like 'video/%' then 'Video'
             when original_message.poll_id is not null then '📊 Poll' else 'Attachment' end)
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.fill_message_reply_snapshot() from public, anon, authenticated;
drop trigger if exists fill_message_reply_snapshot_before_insert on public.messages;
create trigger fill_message_reply_snapshot_before_insert before insert on public.messages
for each row execute function public.fill_message_reply_snapshot();
update public.messages as reply
set reply_to_sender_id=original.sender_id,
    reply_to_content=case when original.deleted_at is not null then 'This message was deleted'
      else coalesce(nullif(btrim(original.content),''),nullif(btrim(original.attachment_name),''),
        case when original.attachment_type like 'image/%' then 'Photo'
             when original.attachment_type like 'video/%' then 'Video'
             when original.poll_id is not null then '📊 Poll' else 'Attachment' end) end
from public.messages as original
where reply.reply_to_message_id=original.id and reply.conversation_id=original.conversation_id
  and (reply.reply_to_content is null or btrim(reply.reply_to_content)='' or reply.reply_to_sender_id is null);
