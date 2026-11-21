create table if not exists public.chatter_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chatter_push_subscriptions_user_endpoint_key unique (user_id, endpoint)
);

create index if not exists chatter_push_subscriptions_user_id_idx
  on public.chatter_push_subscriptions (user_id);

alter table public.chatter_push_subscriptions enable row level security;

grant select, insert, update, delete on public.chatter_push_subscriptions to authenticated;

drop policy if exists "Members can read their own push subscriptions" on public.chatter_push_subscriptions;
create policy "Members can read their own push subscriptions"
  on public.chatter_push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members can register their own push subscriptions" on public.chatter_push_subscriptions;
create policy "Members can register their own push subscriptions"
  on public.chatter_push_subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Members can update their own push subscriptions" on public.chatter_push_subscriptions;
create policy "Members can update their own push subscriptions"
  on public.chatter_push_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Members can remove their own push subscriptions" on public.chatter_push_subscriptions;
create policy "Members can remove their own push subscriptions"
  on public.chatter_push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);
