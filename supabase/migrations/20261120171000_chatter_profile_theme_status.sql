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
