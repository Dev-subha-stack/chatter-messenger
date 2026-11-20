-- Chatter: linked profiles, follows, full message replies and shareable image emojis.
alter table public.profiles
  add column if not exists bio_links text[] not null default '{}';

alter table public.messages
  add column if not exists reply_to_sender_id uuid references public.profiles(id) on delete set null,
  add column if not exists reply_to_content text;

alter table public.user_custom_emojis
  add column if not exists image_path text;

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
create policy "Members can view follow relationships" on public.user_follows
  for select to authenticated using (true);
drop policy if exists "Members can follow as themselves" on public.user_follows;
create policy "Members can follow as themselves" on public.user_follows
  for insert to authenticated with check (follower_id = (select auth.uid()) and follower_id <> following_id);
drop policy if exists "Members can unfollow as themselves" on public.user_follows;
create policy "Members can unfollow as themselves" on public.user_follows
  for delete to authenticated using (follower_id = (select auth.uid()));
grant select, insert, delete on public.user_follows to authenticated;

-- This bucket is public-read so the same shortcode resolves for every chat participant.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('custom-emojis','custom-emojis',true,524288,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Members can read shared custom emojis" on public.user_custom_emojis;
create policy "Members can read shared custom emojis" on public.user_custom_emojis
  for select to authenticated using (true);
drop policy if exists "Members upload their own emoji images" on storage.objects;
create policy "Members upload their own emoji images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'custom-emojis' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "Members delete their own emoji images" on storage.objects;
create policy "Members delete their own emoji images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'custom-emojis' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Messages and follow events are first-class inbox notifications.
alter table public.chatter_notifications
  drop constraint if exists chatter_notifications_notification_type_check;
alter table public.chatter_notifications
  add constraint chatter_notifications_notification_type_check
  check (notification_type in ('message_mention','post_mention','comment_mention','new_message','new_follower'));
alter table public.chatter_notifications
  drop constraint if exists chatter_notifications_target_type_check;
alter table public.chatter_notifications
  add constraint chatter_notifications_target_type_check
  check (target_type in ('conversation','post','profile'));

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
