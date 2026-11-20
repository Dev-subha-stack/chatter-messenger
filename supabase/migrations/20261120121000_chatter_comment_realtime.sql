-- Publish post comments so comment threads refresh live for other users.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='post_comments'
    ) then
      alter publication supabase_realtime add table public.post_comments;
    end if;
  end if;
end $$;
