-- Overture Instruments: public OMNI patch library
-- Apply this migration in the Supabase SQL editor before enabling the Community page.

create table if not exists public.community_patches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null default 'omni_patch' check (record_type in ('omni_patch', 'instrument_preset')),
  instrument_id text check (instrument_id in ('little-phatty', 'sub-37', 'prophet-10', 'nord-c2d', 'ms-20', 'juno-106', 'tr-808', 'dx7', 'mellotron-m400', 'oberheim-eight-voice', 'hohner-d6', 'ob-xa', 'sequential-pro-3', 'udo-super-8')),
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 600),
  author_name text not null default 'Overture user' check (char_length(author_name) <= 48),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted')),
  patch_data jsonb not null check (
    jsonb_typeof(patch_data) = 'object'
    and octet_length(patch_data::text) <= 524288
  ),
  preview_path text,
  downloads bigint not null default 0 check (downloads >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_record_instrument_consistency check (
    (record_type = 'omni_patch' and instrument_id is null)
    or (record_type = 'instrument_preset' and instrument_id is not null)
  )
);

-- Also supports upgrading a project where an earlier version of this table
-- was created before instrument presets were introduced.
alter table public.community_patches add column if not exists record_type text not null default 'omni_patch';
alter table public.community_patches add column if not exists instrument_id text;
alter table public.community_patches drop constraint if exists community_patches_instrument_id_check;
alter table public.community_patches add constraint community_patches_instrument_id_check
  check (instrument_id is null or instrument_id in ('little-phatty', 'sub-37', 'prophet-10', 'nord-c2d', 'ms-20', 'juno-106', 'tr-808', 'dx7', 'mellotron-m400', 'oberheim-eight-voice', 'hohner-d6', 'ob-xa', 'sequential-pro-3', 'udo-super-8'));
alter table public.community_patches drop constraint if exists community_record_instrument_consistency;
alter table public.community_patches add constraint community_record_instrument_consistency check (
  record_type in ('omni_patch', 'instrument_preset')
  and (instrument_id is null or instrument_id in ('little-phatty', 'sub-37', 'prophet-10', 'nord-c2d', 'ms-20', 'juno-106', 'tr-808', 'dx7'))
  and ((record_type = 'omni_patch' and instrument_id is null) or (record_type = 'instrument_preset' and instrument_id is not null))
);

create index if not exists community_patches_public_created_idx
  on public.community_patches (created_at desc)
  where visibility = 'public';

create index if not exists community_patches_public_downloads_idx
  on public.community_patches (downloads desc)
  where visibility = 'public';

create index if not exists community_patches_tags_idx
  on public.community_patches using gin (tags);

create index if not exists community_patches_search_idx
  on public.community_patches using gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  );

alter table public.community_patches enable row level security;

drop policy if exists "Public and unlisted patches can be read" on public.community_patches;
create policy "Public and unlisted patches can be read"
  on public.community_patches for select
  to anon, authenticated
  using (visibility = 'public' or owner_id = (select auth.uid()));

drop policy if exists "Users can publish their own patches" on public.community_patches;
create policy "Users can publish their own patches"
  on public.community_patches for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users can edit their own patches" on public.community_patches;
create policy "Users can edit their own patches"
  on public.community_patches for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users can delete their own patches" on public.community_patches;
create policy "Users can delete their own patches"
  on public.community_patches for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create or replace function public.community_patch_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists community_patches_touch_updated_at on public.community_patches;
create trigger community_patches_touch_updated_at
  before update on public.community_patches
  for each row execute function public.community_patch_touch_updated_at();

-- An unlisted item can be opened only when its UUID is already known.
-- Direct table reads remain limited to public items and the signed-in owner.
create or replace function public.get_community_patch_by_id(p_patch_id uuid)
returns setof public.community_patches
language sql
security definer
set search_path = ''
as $$
  select patch.*
    from public.community_patches as patch
   where patch.id = p_patch_id
     and (patch.visibility in ('public', 'unlisted')
       or patch.owner_id = (select auth.uid()));
$$;

revoke all on function public.get_community_patch_by_id(uuid) from public;
grant execute on function public.get_community_patch_by_id(uuid) to anon, authenticated;

create or replace function public.increment_community_patch_downloads(p_patch_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_count bigint;
begin
  update public.community_patches
     set downloads = downloads + 1
   where id = p_patch_id
     and visibility in ('public', 'unlisted')
  returning downloads into new_count;

  if new_count is null then
    raise exception 'Patch not found or not published';
  end if;

  return new_count;
end;
$$;

revoke all on function public.increment_community_patch_downloads(uuid) from public;
grant execute on function public.increment_community_patch_downloads(uuid) to anon, authenticated;

grant select on public.community_patches to anon, authenticated;
revoke insert, update, delete on public.community_patches from authenticated;
grant insert (owner_id, record_type, instrument_id, title, description, author_name, tags, visibility, patch_data, preview_path)
  on public.community_patches to authenticated;
grant update (record_type, instrument_id, title, description, author_name, tags, visibility, patch_data, preview_path)
  on public.community_patches to authenticated;
grant delete on public.community_patches to authenticated;

-- Optional uploaded audio previews. Files are public-read but only the
-- authenticated owner can create or delete objects inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-previews',
  'community-previews',
  true,
  8388608,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Community audio previews are publicly readable" on storage.objects;
create policy "Community audio previews are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'community-previews');

drop policy if exists "Users can upload their own community previews" on storage.objects;
create policy "Users can upload their own community previews"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-previews'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own community previews" on storage.objects;
create policy "Users can delete their own community previews"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'community-previews'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
