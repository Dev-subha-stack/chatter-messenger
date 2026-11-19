create table if not exists public.chatter_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.chatter_admins enable row level security;
revoke all on table public.chatter_admins from anon;
grant select on table public.chatter_admins to authenticated;

drop policy if exists "Admins can read their own admin record" on public.chatter_admins;
create policy "Admins can read their own admin record"
  on public.chatter_admins for select to authenticated
  using ((select auth.uid()) = user_id);

insert into public.chatter_admins (user_id, email)
select id, lower(email)
from auth.users
where lower(email) = 'romendraroy4@gmail.com'
  and email_confirmed_at is not null
on conflict (user_id) do update set email = excluded.email;

create table if not exists public.chatter_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_email text not null,
  action text not null,
  target_user_id uuid,
  target_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chatter_admin_audit_created_idx
  on public.chatter_admin_audit (created_at desc);

alter table public.chatter_admin_audit enable row level security;
revoke all on table public.chatter_admin_audit from anon, authenticated;

drop policy if exists "Admins can read admin audit log" on public.chatter_admin_audit;
create policy "Admins can read admin audit log"
  on public.chatter_admin_audit for select to authenticated
  using (exists (
    select 1 from public.chatter_admins a
    where a.user_id = (select auth.uid())
  ));
