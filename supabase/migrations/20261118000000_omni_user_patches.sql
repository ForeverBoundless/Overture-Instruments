-- Private, account-owned OMNI patch library.
-- Records are visible only to their owner. Community publishing remains a separate action.

create table if not exists public.omni_user_patches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 600),
  patch_data jsonb not null check (
    jsonb_typeof(patch_data) = 'object'
    and octet_length(patch_data::text) <= 524288
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists omni_user_patches_owner_updated_idx
  on public.omni_user_patches (owner_id, updated_at desc);

alter table public.omni_user_patches enable row level security;

drop policy if exists "Users can read their own OMNI patches" on public.omni_user_patches;
create policy "Users can read their own OMNI patches"
  on public.omni_user_patches for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Users can create their own OMNI patches" on public.omni_user_patches;
create policy "Users can create their own OMNI patches"
  on public.omni_user_patches for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users can update their own OMNI patches" on public.omni_user_patches;
create policy "Users can update their own OMNI patches"
  on public.omni_user_patches for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users can delete their own OMNI patches" on public.omni_user_patches;
create policy "Users can delete their own OMNI patches"
  on public.omni_user_patches for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create or replace function public.omni_user_patch_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists omni_user_patches_touch_updated_at on public.omni_user_patches;
create trigger omni_user_patches_touch_updated_at
  before update on public.omni_user_patches
  for each row execute function public.omni_user_patch_touch_updated_at();

grant select, insert, update, delete on public.omni_user_patches to authenticated;
revoke all on public.omni_user_patches from anon;
