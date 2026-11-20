-- Chatter media posts, per-chat wallpapers, and live profile updates.
alter table public.posts alter column content set default '';
alter table public.posts drop constraint if exists posts_content_check;
alter table public.posts add constraint posts_content_length_check
  check (char_length(content) between 0 and 1000);
alter table public.posts add column if not exists media_path text;
alter table public.posts add column if not exists media_type text;
alter table public.posts add column if not exists media_name text;
alter table public.posts add column if not exists media_size bigint;
alter table public.posts drop constraint if exists posts_content_or_media_check;
alter table public.posts add constraint posts_content_or_media_check
  check (char_length(content) > 0 or media_path is not null);

alter table public.conversation_members
  add column if not exists chat_background text not null default 'default';
alter table public.conversation_members
  add column if not exists chat_background_path text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversation_members_chat_background_check'
      and conrelid = 'public.conversation_members'::regclass
  ) then
    alter table public.conversation_members
      add constraint conversation_members_chat_background_check
      check (chat_background in ('default','midnight','forest','dusk','rose','paper','custom'));
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media', 'post-media', false, 31457280,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Post authors can upload their own media" on storage.objects;
create policy "Post authors can upload their own media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'post-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Members can read media attached to posts" on storage.objects;
create policy "Members can read media attached to posts"
on storage.objects for select to authenticated
using (
  bucket_id = 'post-media'
  and exists (
    select 1 from public.posts p
    where p.media_path = storage.objects.name
  )
);

drop policy if exists "Post authors can delete their own media" on storage.objects;
create policy "Post authors can delete their own media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'post-media'
  and exists (
    select 1 from public.posts p
    where p.media_path = storage.objects.name
      and p.author_id = (select auth.uid())
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;