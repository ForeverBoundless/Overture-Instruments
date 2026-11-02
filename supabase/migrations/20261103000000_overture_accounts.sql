-- Overture Instruments accounts and public profiles.
-- Apply after the Community library migration. Profile rows contain only public
-- identity fields; email addresses remain in Supabase Auth and are never exposed.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text,
  avatar_url text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 80)
);

create unique index if not exists profiles_username_lower_idx on public.profiles (lower(username));
create index if not exists profiles_display_name_idx on public.profiles (display_name);

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are readable" on public.profiles;
create policy "Public profiles are readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

grant select on public.profiles to anon, authenticated;
grant insert (id, username, display_name, avatar_url, avatar_path) on public.profiles to authenticated;
grant update (username, display_name, avatar_url, avatar_path) on public.profiles to authenticated;

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- Create a profile whenever Supabase Auth creates an email or OAuth account.
-- New users may edit this generated username immediately after signing in.
create or replace function public.handle_new_overture_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  safe_username text;
  suffix text;
begin
  requested_username := lower(regexp_replace(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(new.raw_user_meta_data ->> 'user_name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'overture_user'
    ),
    '[^a-zA-Z0-9_]', '', 'g'
  ));
  requested_username := left(coalesce(nullif(requested_username, ''), 'overture_user'), 24);
  if char_length(requested_username) < 3 then
    requested_username := 'user';
  end if;

  safe_username := requested_username;
  if exists (select 1 from public.profiles p where lower(p.username) = safe_username) then
    suffix := right(replace(new.id::text, '-', ''), 6);
    safe_username := left(requested_username, 17) || '_' || suffix;
  end if;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    safe_username,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80), ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_overture_user() from public;

drop trigger if exists on_auth_user_created_overture_profile on auth.users;
create trigger on_auth_user_created_overture_profile
  after insert on auth.users
  for each row execute function public.handle_new_overture_user();

-- Backfill existing Community users and any accounts created before this
-- migration. The UUID suffix makes generated names distinct without exposing email.
insert into public.profiles (id, username, display_name, avatar_url)
select
  u.id,
  left(
    coalesce(
      nullif(lower(regexp_replace(
        coalesce(nullif(u.raw_user_meta_data ->> 'user_name', ''), split_part(coalesce(u.email, ''), '@', 1), 'overture_user'),
        '[^a-zA-Z0-9_]', '', 'g'
      )), ''),
      'overture_user'
    ),
    17
  ) || '_' || right(replace(u.id::text, '-', ''), 6),
  nullif(left(coalesce(u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), 80), ''),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
on conflict (id) do nothing;

-- Public profile pictures. Each account may write only inside its own UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile pictures are publicly readable" on storage.objects;
create policy "Profile pictures are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'profile-avatars');

drop policy if exists "Users can upload their own profile pictures" on storage.objects;
create policy "Users can upload their own profile pictures"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can replace their own profile pictures" on storage.objects;
create policy "Users can replace their own profile pictures"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own profile pictures" on storage.objects;
create policy "Users can delete their own profile pictures"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
