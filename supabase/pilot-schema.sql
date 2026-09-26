-- FireGroup Mini ATS: isolated authorization pilot. All names and candidates below are fictional.
-- Run in a NEW Supabase project. Do not run against the production spreadsheet.

create table if not exists public.pilot_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text check (role in ('admin', 'recruiter', 'hiring_manager', 'interviewer')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint pilot_users_email_lowercase check (email = lower(btrim(email))),
  constraint pilot_users_active_has_role check (not active or role is not null)
);

create table if not exists public.pilot_job_access (
  user_id uuid not null references public.pilot_users(user_id) on delete cascade,
  job_id text not null check (job_id ~ '^[A-Z0-9-]{2,32}$'),
  primary key (user_id, job_id)
);

create table if not exists public.pilot_candidates (
  candidate_id text primary key,
  job_id text not null,
  name text not null,
  role_name text not null,
  stage text not null
);

-- SECURITY DEFINER is necessary here so the admin lookup does not recurse through RLS.
create or replace function public.pilot_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pilot_users u
    where u.user_id = (select auth.uid()) and u.role = 'admin' and u.active
  );
$$;

alter table public.pilot_users enable row level security;
alter table public.pilot_job_access enable row level security;
alter table public.pilot_candidates enable row level security;

drop policy if exists pilot_users_read on public.pilot_users;
create policy pilot_users_read on public.pilot_users for select to authenticated
  using (user_id = (select auth.uid()) or (select public.pilot_is_admin()));

drop policy if exists pilot_users_register on public.pilot_users;
create policy pilot_users_register on public.pilot_users for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and email = lower((select auth.jwt())->>'email')
    and role is null and active = false
  );

drop policy if exists pilot_users_admin_update on public.pilot_users;
create policy pilot_users_admin_update on public.pilot_users for update to authenticated
  using ((select public.pilot_is_admin())) with check ((select public.pilot_is_admin()));

drop policy if exists pilot_jobs_read on public.pilot_job_access;
create policy pilot_jobs_read on public.pilot_job_access for select to authenticated
  using (user_id = (select auth.uid()) or (select public.pilot_is_admin()));

drop policy if exists pilot_jobs_admin_insert on public.pilot_job_access;
create policy pilot_jobs_admin_insert on public.pilot_job_access for insert to authenticated
  with check ((select public.pilot_is_admin()));

drop policy if exists pilot_jobs_admin_delete on public.pilot_job_access;
create policy pilot_jobs_admin_delete on public.pilot_job_access for delete to authenticated
  using ((select public.pilot_is_admin()));

drop policy if exists pilot_candidates_read on public.pilot_candidates;
create policy pilot_candidates_read on public.pilot_candidates for select to authenticated
  using (
    (select public.pilot_is_admin()) or (
      exists (
        select 1 from public.pilot_users u
        join public.pilot_job_access j on j.user_id = u.user_id
        where u.user_id = (select auth.uid()) and u.active and j.job_id = pilot_candidates.job_id
      )
    )
  );

-- Explicit grants plus RLS: anonymous users have no access to these pilot tables.
revoke all on public.pilot_users, public.pilot_job_access, public.pilot_candidates from anon;
grant select, insert, update on public.pilot_users to authenticated;
grant select, insert, delete on public.pilot_job_access to authenticated;
grant select on public.pilot_candidates to authenticated;
revoke all on function public.pilot_is_admin() from public, anon;
grant execute on function public.pilot_is_admin() to authenticated;

insert into public.pilot_candidates (candidate_id, job_id, name, role_name, stage) values
  ('DEMO-001', 'FG-1024', 'Nguyen Demo A', 'Frontend Developer', 'New'),
  ('DEMO-002', 'FG-1024', 'Tran Demo B', 'Frontend Developer', 'Interview'),
  ('DEMO-003', 'FG-1022', 'Le Demo C', 'AI Engineer', 'Screening')
on conflict (candidate_id) do nothing;

-- Bootstrap only after the admin has signed in with Google once (see README).
-- This SQL is run in Supabase SQL Editor, never from the public website:
-- update public.pilot_users set role = 'admin', active = true
-- where email = 'phuc.phamdinh18@gmail.com';
