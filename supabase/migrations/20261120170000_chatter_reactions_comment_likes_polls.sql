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
