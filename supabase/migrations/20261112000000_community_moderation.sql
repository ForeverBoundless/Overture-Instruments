-- Community reporting, moderator review, and escalating account strikes.
-- Apply after the Community and Overture Accounts migrations.

alter table public.community_patches
  add column if not exists moderation_status text not null default 'visible';
alter table public.community_patches
  drop constraint if exists community_patches_moderation_status_check;
alter table public.community_patches
  add constraint community_patches_moderation_status_check
  check (moderation_status in ('visible', 'hidden'));

create table if not exists public.community_protected_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text not null default 'Protected Overture maintainer account'
);

alter table public.community_protected_users enable row level security;
revoke all on public.community_protected_users from anon, authenticated;

-- This table stores the reporter's single report for a patch. Reports are only
-- readable through the moderator-only RPC below.
create table if not exists public.community_patch_reports (
  id uuid primary key default gen_random_uuid(),
  patch_id uuid not null references public.community_patches(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in (
    'inappropriate_audio',
    'hate_or_harassment',
    'sexual_content',
    'threats_or_violence',
    'copyright_or_ownership',
    'spam_or_misleading',
    'other'
  )),
  details text not null default '' check (char_length(details) <= 600),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  moderator_note text not null default '' check (char_length(moderator_note) <= 600),
  created_at timestamptz not null default now(),
  unique (patch_id, reporter_id)
);

create index if not exists community_patch_reports_open_idx
  on public.community_patch_reports (created_at asc)
  where status = 'open';
create index if not exists community_patch_reports_reporter_idx
  on public.community_patch_reports (reporter_id, created_at desc);

alter table public.community_patch_reports enable row level security;
revoke all on public.community_patch_reports from anon, authenticated;

create table if not exists public.community_user_strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_id uuid not null unique references public.community_patch_reports(id) on delete cascade,
  issued_by uuid not null references auth.users(id),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists community_user_strikes_user_idx
  on public.community_user_strikes (user_id, created_at desc);

alter table public.community_user_strikes enable row level security;
revoke all on public.community_user_strikes from anon, authenticated;

create table if not exists public.community_user_sanctions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  strike_count integer not null default 0 check (strike_count >= 0),
  suspended_until timestamptz,
  banned_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.community_user_sanctions enable row level security;
revoke all on public.community_user_sanctions from anon, authenticated;

-- Resolve the protected maintainer once to a stable auth UUID. The username
-- fallback also covers a migration applied before the profile has been made.
insert into public.community_protected_users (user_id)
select id
  from public.profiles
 where lower(username) = 'michaelcarpiano'
on conflict (user_id) do nothing;

create or replace function public.community_register_protected_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.username) = 'michaelcarpiano' then
    insert into public.community_protected_users (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.community_register_protected_profile() from public;
drop trigger if exists community_register_protected_profile on public.profiles;
create trigger community_register_protected_profile
  after insert or update of username on public.profiles
  for each row execute function public.community_register_protected_profile();

create or replace function public.community_is_protected_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and (
    exists (
      select 1 from public.community_protected_users as protected
       where protected.user_id = p_user_id
    )
    or exists (
      select 1 from public.profiles as profile
       where profile.id = p_user_id
         and lower(profile.username) = 'michaelcarpiano'
    )
  );
$$;

create or replace function public.community_is_moderator(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.community_is_protected_user(p_user_id);
$$;

create or replace function public.community_can_publish(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account_state public.community_user_sanctions%rowtype;
begin
  if p_user_id is null then return false; end if;
  if public.community_is_protected_user(p_user_id) then return true; end if;

  select * into account_state
    from public.community_user_sanctions
   where user_id = p_user_id;

  if not found then return true; end if;
  if account_state.banned_at is not null then return false; end if;
  return account_state.suspended_until is null or account_state.suspended_until <= now();
end;
$$;

revoke all on function public.community_is_protected_user(uuid) from public;
revoke all on function public.community_is_moderator(uuid) from public;
revoke all on function public.community_can_publish(uuid) from public;
grant execute on function public.community_is_moderator(uuid) to authenticated;
grant execute on function public.community_can_publish(uuid) to authenticated;

-- Replace the original owner policies with sanction-aware policies.
drop policy if exists "Public and unlisted patches can be read" on public.community_patches;
create policy "Visible public patches, owners and moderators can read"
  on public.community_patches for select
  to anon, authenticated
  using (
    (visibility = 'public' and moderation_status = 'visible')
    or owner_id = (select auth.uid())
    or public.community_is_moderator((select auth.uid()))
  );

drop policy if exists "Users can publish their own patches" on public.community_patches;
create policy "Eligible users can publish their own patches"
  on public.community_patches for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.community_can_publish((select auth.uid()))
  );

drop policy if exists "Users can edit their own patches" on public.community_patches;
create policy "Eligible users can edit their own patches"
  on public.community_patches for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.community_can_publish((select auth.uid()))
  )
  with check (
    owner_id = (select auth.uid())
    and public.community_can_publish((select auth.uid()))
  );

drop policy if exists "Users can delete their own patches" on public.community_patches;
create policy "Eligible users can delete their own patches"
  on public.community_patches for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and public.community_can_publish((select auth.uid()))
  );

-- Hidden items are no longer available by direct link, except to their owner
-- and the protected moderator account.
create or replace function public.get_community_patch_by_id(p_patch_id uuid)
returns setof public.community_patches
language sql
security definer
set search_path = ''
as $$
  select patch.*
    from public.community_patches as patch
   where patch.id = p_patch_id
     and (
       (patch.visibility in ('public', 'unlisted') and patch.moderation_status = 'visible')
       or patch.owner_id = (select auth.uid())
       or public.community_is_moderator((select auth.uid()))
     );
$$;

revoke all on function public.get_community_patch_by_id(uuid) from public;
grant execute on function public.get_community_patch_by_id(uuid) to anon, authenticated;

-- Report submission is authenticated, rate-limited, duplicate-safe, and cannot
-- be used to report one's own patch.
create or replace function public.submit_community_patch_report(
  p_patch_id uuid,
  p_reason text,
  p_details text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  patch_owner_id uuid;
  recent_reports integer;
  new_report_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before reporting a Community item.';
  end if;
  if p_reason not in (
    'inappropriate_audio', 'hate_or_harassment', 'sexual_content',
    'threats_or_violence', 'copyright_or_ownership', 'spam_or_misleading', 'other'
  ) then
    raise exception 'Choose a valid report reason.';
  end if;

  select owner_id into patch_owner_id
    from public.community_patches
   where id = p_patch_id
     and visibility in ('public', 'unlisted')
     and moderation_status = 'visible';
  if not found then
    raise exception 'This Community item is no longer available to report.';
  end if;
  if patch_owner_id = current_user_id then
    raise exception 'You cannot report your own Community item.';
  end if;

  select count(*) into recent_reports
    from public.community_patch_reports
   where reporter_id = current_user_id
     and created_at > now() - interval '24 hours';
  if recent_reports >= 10 then
    raise exception 'You have reached the daily report limit. Please try again later.';
  end if;

  insert into public.community_patch_reports (patch_id, reporter_id, reason, details)
  values (p_patch_id, current_user_id, p_reason, left(trim(coalesce(p_details, '')), 600))
  on conflict (patch_id, reporter_id) do nothing
  returning id into new_report_id;

  if new_report_id is null then
    raise exception 'You have already reported this item.';
  end if;

  return jsonb_build_object('ok', true, 'report_id', new_report_id);
end;
$$;

-- The moderator account can see only open reports. Reporter email addresses
-- are never selected or returned.
create or replace function public.get_community_moderation_reports()
returns table (
  report_id uuid,
  patch_id uuid,
  reason text,
  details text,
  reported_at timestamptz,
  reporter_username text,
  patch_title text,
  patch_owner_id uuid,
  patch_owner_username text,
  patch_moderation_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.community_is_moderator(auth.uid()) then
    raise exception 'You are not authorized to view Community reports.';
  end if;

  return query
  select
    report.id,
    report.patch_id,
    report.reason,
    report.details,
    report.created_at,
    reporter.username,
    patch.title,
    patch.owner_id,
    owner_profile.username,
    patch.moderation_status
  from public.community_patch_reports as report
  join public.community_patches as patch on patch.id = report.patch_id
  left join public.profiles as reporter on reporter.id = report.reporter_id
  left join public.profiles as owner_profile on owner_profile.id = patch.owner_id
  where report.status = 'open'
  order by report.created_at asc
  limit 100;
end;
$$;

create or replace function public.review_community_patch_report(
  p_report_id uuid,
  p_action text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_row public.community_patch_reports%rowtype;
  patch_owner_id uuid;
  current_strikes integer;
  next_suspended_until timestamptz;
  next_banned_at timestamptz;
begin
  if not public.community_is_moderator(auth.uid()) then
    raise exception 'You are not authorized to review Community reports.';
  end if;
  if p_action not in ('dismiss', 'strike', 'strike_and_hide') then
    raise exception 'Choose a valid moderation action.';
  end if;

  select * into report_row
    from public.community_patch_reports
   where id = p_report_id
   for update;
  if not found or report_row.status <> 'open' then
    raise exception 'This report has already been reviewed or no longer exists.';
  end if;

  if p_action = 'dismiss' then
    update public.community_patch_reports
       set status = 'dismissed',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           moderator_note = left(trim(coalesce(p_note, '')), 600)
     where id = p_report_id;
    return jsonb_build_object('status', 'dismissed');
  end if;

  select owner_id into patch_owner_id
    from public.community_patches
   where id = report_row.patch_id;

  if patch_owner_id is null then
    update public.community_patch_reports
       set status = 'actioned', reviewed_by = auth.uid(), reviewed_at = now(),
           moderator_note = 'The reported patch no longer exists.'
     where id = p_report_id;
    return jsonb_build_object('status', 'patch_missing');
  end if;

  -- The protected maintainer account cannot receive strikes or have content
  -- hidden through this moderation system, even when a report is upheld.
  if public.community_is_protected_user(patch_owner_id) then
    update public.community_patch_reports
       set status = 'actioned',
           reviewed_by = auth.uid(),
           reviewed_at = now(),
           moderator_note = left(coalesce(nullif(trim(p_note), ''), 'Protected account: no strike or content action applied.'), 600)
     where id = p_report_id;
    return jsonb_build_object('status', 'protected', 'strikes', 0, 'hidden', false);
  end if;

  insert into public.community_user_strikes (user_id, report_id, issued_by, reason)
  values (patch_owner_id, p_report_id, auth.uid(), report_row.reason)
  on conflict (report_id) do nothing;

  select count(*)::integer into current_strikes
    from public.community_user_strikes
   where user_id = patch_owner_id;

  select suspended_until, banned_at
    into next_suspended_until, next_banned_at
    from public.community_user_sanctions
   where user_id = patch_owner_id;

  if current_strikes = 2 then
    next_suspended_until := now() + interval '7 days';
  elsif current_strikes = 3 then
    next_suspended_until := now() + interval '30 days';
  elsif current_strikes >= 4 then
    next_banned_at := coalesce(next_banned_at, now());
  end if;

  insert into public.community_user_sanctions (user_id, strike_count, suspended_until, banned_at, updated_at)
  values (patch_owner_id, current_strikes, next_suspended_until, next_banned_at, now())
  on conflict (user_id) do update
    set strike_count = excluded.strike_count,
        suspended_until = excluded.suspended_until,
        banned_at = excluded.banned_at,
        updated_at = now();

  if p_action = 'strike_and_hide' then
    update public.community_patches
       set moderation_status = 'hidden'
     where id = report_row.patch_id;
  end if;

  update public.community_patch_reports
     set status = 'actioned',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         moderator_note = left(trim(coalesce(p_note, '')), 600)
   where id = p_report_id;

  return jsonb_build_object(
    'status', 'actioned',
    'strikes', current_strikes,
    'suspended_until', next_suspended_until,
    'banned', next_banned_at is not null,
    'hidden', p_action = 'strike_and_hide'
  );
end;
$$;

create or replace function public.get_community_account_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  strike_total integer := 0;
  suspended_until_value timestamptz;
  banned_at_value timestamptz;
  protected_value boolean := false;
  can_publish_value boolean := false;
begin
  if current_user_id is null then
    return jsonb_build_object('authenticated', false, 'can_publish', false, 'protected', false, 'strikes', 0);
  end if;

  protected_value := public.community_is_protected_user(current_user_id);
  select count(*)::integer into strike_total
    from public.community_user_strikes
   where user_id = current_user_id;
  select suspended_until, banned_at
    into suspended_until_value, banned_at_value
    from public.community_user_sanctions
   where user_id = current_user_id;

  can_publish_value := protected_value
    or (banned_at_value is null and (suspended_until_value is null or suspended_until_value <= now()));

  return jsonb_build_object(
    'authenticated', true,
    'protected', protected_value,
    'strikes', case when protected_value then 0 else strike_total end,
    'suspended_until', case when protected_value then null else suspended_until_value end,
    'banned', case when protected_value then false else banned_at_value is not null end,
    'can_publish', can_publish_value
  );
end;
$$;

revoke all on function public.submit_community_patch_report(uuid, text, text) from public;
revoke all on function public.get_community_moderation_reports() from public;
revoke all on function public.review_community_patch_report(uuid, text, text) from public;
revoke all on function public.get_community_account_status() from public;
grant execute on function public.submit_community_patch_report(uuid, text, text) to authenticated;
grant execute on function public.get_community_moderation_reports() to authenticated;
grant execute on function public.review_community_patch_report(uuid, text, text) to authenticated;
grant execute on function public.get_community_account_status() to authenticated;

-- Existing upload/delete policies must also honor an active Community sanction.
drop policy if exists "Users can upload their own community previews" on storage.objects;
create policy "Eligible users can upload their own community previews"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-previews'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.community_can_publish((select auth.uid()))
  );

drop policy if exists "Users can delete their own community previews" on storage.objects;
create policy "Eligible users can delete their own community previews"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'community-previews'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.community_can_publish((select auth.uid()))
  );
