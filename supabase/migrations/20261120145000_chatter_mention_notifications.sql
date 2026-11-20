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