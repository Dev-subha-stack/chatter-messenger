alter table public.profiles add column if not exists username_color text not null default '#A3E6D3' check (username_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.messages add column if not exists attachment_url text;
alter table public.messages add column if not exists attachment_name text;
alter table public.messages add column if not exists attachment_type text;
alter table public.messages add column if not exists attachment_size bigint;

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
