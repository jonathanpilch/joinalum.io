-- Alum accounts: school-email sign-in, synced profile and tracker, radars
-- (saved searches that email you), and Hokie interview notes.
--
-- Every table is row-level secured: a student reads and writes only their
-- own rows. Interview notes are readable by every signed-in student, but
-- never with the author attached. The notifier (ingest/notify.mjs) runs
-- with the service role and reaches emails only through the functions at
-- the bottom, which nobody else can call.

-- Who may sign up -----------------------------------------------------------

create table public.allowed_domains (
  domain text primary key,          -- "vt.edu"
  school text not null              -- matches the slug in schools.js
);
insert into public.allowed_domains (domain, school) values ('vt.edu', 'vt');
alter table public.allowed_domains enable row level security;
create policy "anyone can read the domain list" on public.allowed_domains for select using (true);

-- Refuse any sign-up whose email isn't a listed school domain, and give
-- every new student an empty profile tagged with their school.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s text;
begin
  select school into s from public.allowed_domains
   where domain = lower(split_part(new.email, '@', 2));
  if s is null then
    raise exception 'Alum is for students with a school email address.' using errcode = 'P0001';
  end if;
  insert into public.profiles (user_id, school) values (new.id, s);
  return new;
end $$;

-- Profile -------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  school text not null,
  name text not null default '',
  major text not null default '',
  grad_year smallint,                -- graduating in May of this year
  term text not null default 'Summer 2027',
  degree text not null default 'Bachelor''s' check (degree in ('Bachelor''s', 'Master''s', 'PhD')),
  work text not null default '' check (work in ('', 'citizen', 'cleared', 'pr', 'visa')),
  gpa numeric(3, 2) check (gpa is null or gpa between 0 and 4),
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  places text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Raising here rolls the whole sign-up back, so no account is created.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Tracker -------------------------------------------------------------------

create table public.saved (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  job_id text not null,
  status text not null default 'Saved' check (status in ('Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected')),
  job jsonb not null,                -- snapshot, so it survives the posting coming down
  deadline date,
  remind_on date,
  notes text not null default '' check (length(notes) <= 4000),
  history jsonb not null default '[]',   -- [{status, at}]
  reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
alter table public.saved enable row level security;
create policy "own tracker" on public.saved for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A new reminder date means a new reminder.
create function public.saved_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.remind_on is distinct from old.remind_on then new.reminded_at := null; end if;
  return new;
end $$;
create trigger saved_touch before update on public.saved for each row execute function public.saved_touch();

-- Radars --------------------------------------------------------------------

create table public.radars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 80),
  search jsonb not null,             -- { q, cat, filters } exactly as the page uses them
  cadence text not null default 'daily' check (cadence in ('instant', 'daily', 'weekly', 'off')),
  last_sent_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index radars_user on public.radars (user_id);
alter table public.radars enable row level security;
create policy "own radars" on public.radars for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- What each radar already emailed, so a posting is never sent twice.
create table public.radar_sends (
  radar_id uuid not null references public.radars on delete cascade,
  job_id text not null,
  sent_at timestamptz not null default now(),
  primary key (radar_id, job_id)
);
alter table public.radar_sends enable row level security; -- service role only

-- Interview notes -----------------------------------------------------------

create table public.interview_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  school text not null default 'vt',
  company text not null check (length(company) between 1 and 120),
  job_id text,
  job_title text check (length(job_title) <= 200),
  term text,
  stage text not null check (stage in ('applied', 'assessment', 'phone', 'technical', 'final', 'offer')),
  outcome text not null check (outcome in ('offer', 'rejected', 'ghosted', 'pending', 'withdrew')),
  difficulty smallint check (difficulty between 1 and 5),
  weeks smallint check (weeks between 0 and 52),   -- application to answer
  questions text not null default '' check (length(questions) <= 2000),
  tips text not null default '' check (length(tips) <= 2000),
  created_at timestamptz not null default now()
);
create index interview_reports_company on public.interview_reports (school, lower(company));
alter table public.interview_reports enable row level security;
create policy "students read notes" on public.interview_reports for select to authenticated using (true);
create policy "students add their own" on public.interview_reports for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "students delete their own" on public.interview_reports for delete to authenticated
  using (user_id = (select auth.uid()));
-- Readers never see who wrote a note: the author column isn't selectable.
revoke select on public.interview_reports from anon, authenticated;
grant select (id, school, company, job_id, job_title, term, stage, outcome, difficulty, weeks, questions, tips, created_at)
  on public.interview_reports to authenticated;
-- But you can find your own, to delete them.
create function public.my_report_ids() returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from public.interview_reports where user_id = (select auth.uid());
$$;

-- Resume reads, for parse-resume's daily cap (each read is a paid API call).
create table public.resume_reads (
  user_id uuid not null references auth.users on delete cascade,
  at timestamptz not null default now()
);
create index resume_reads_user_at on public.resume_reads (user_id, at);
alter table public.resume_reads enable row level security; -- service role only

-- Notifier (service role only) ------------------------------------------------

-- Radars due now, with the owner's email, profile, and what was already sent.
create function public.due_radars() returns table (
  id uuid, user_id uuid, email text, name text, search jsonb, cadence text,
  last_sent_at timestamptz, profile jsonb, sent text[]
) language sql stable security definer set search_path = '' as $$
  select r.id, r.user_id, u.email::text, r.name, r.search, r.cadence, r.last_sent_at,
         to_jsonb(p) - 'user_id',
         coalesce((select array_agg(s.job_id) from public.radar_sends s
                    where s.radar_id = r.id and s.sent_at > now() - interval '60 days'), '{}')
    from public.radars r
    join auth.users u on u.id = r.user_id
    left join public.profiles p on p.user_id = r.user_id
   where (r.cadence = 'instant')
      or (r.cadence = 'daily' and r.last_sent_at < now() - interval '20 hours')
      or (r.cadence = 'weekly' and r.last_sent_at < now() - interval '6 days 12 hours');
$$;

create function public.mark_radar_sent(radar uuid, job_ids text[]) returns void
language sql security definer set search_path = '' as $$
  update public.radars set last_sent_at = now() where id = radar;
  insert into public.radar_sends (radar_id, job_id)
    select radar, unnest(job_ids) on conflict do nothing;
$$;

-- Tracker reminders due today, one row per saved role.
create function public.due_reminders() returns table (
  user_id uuid, email text, job_id text, status text, job jsonb, deadline date, notes text
) language sql stable security definer set search_path = '' as $$
  select s.user_id, u.email::text, s.job_id, s.status, s.job, s.deadline, s.notes
    from public.saved s join auth.users u on u.id = s.user_id
   where s.remind_on <= current_date and s.reminded_at is null;
$$;

create function public.mark_reminded(uid uuid, job_ids text[]) returns void
language sql security definer set search_path = '' as $$
  update public.saved set reminded_at = now() where user_id = uid and job_id = any (job_ids);
$$;

revoke execute on function public.due_radars(), public.mark_radar_sent(uuid, text[]),
  public.due_reminders(), public.mark_reminded(uuid, text[]), public.handle_new_user()
  from public, anon, authenticated;
grant execute on function public.due_radars(), public.mark_radar_sent(uuid, text[]),
  public.due_reminders(), public.mark_reminded(uuid, text[]) to service_role;
