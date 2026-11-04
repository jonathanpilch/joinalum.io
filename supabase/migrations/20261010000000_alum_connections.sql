-- Connections: a student's tracker on their own calendar.
--
-- Two ways in. Google Calendar connects directly (OAuth, the
-- supabase/functions/google-calendar function): Alum makes an "Alum"
-- calendar in the student's account and keeps it in step with the tracker.
-- It asks only for calendar.app.created, so it can touch the calendar it
-- made and nothing else. Every other calendar (Apple, Outlook, Fastmail...)
-- subscribes to a private feed (supabase/functions/calendar-feed).
--
-- Refresh tokens are never readable from the browser; only the functions,
-- running with the service role, see them.

-- An interview is the most calendar-shaped thing in the tracker.
alter table public.saved add column interview_at timestamptz;

-- Direct connections -----------------------------------------------------------

create table public.connections (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('google')),
  account_email text,                -- which Google account, to show the student
  refresh_token text not null,
  calendar_id text,                  -- the "Alum" calendar we made
  time_zone text not null default 'America/New_York',
  status text not null default 'ok' check (status in ('ok', 'revoked')),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.connections enable row level security;
create policy "own connections" on public.connections for select to authenticated
  using (user_id = (select auth.uid()));
-- The browser sees that it's connected, never the token. Writes go through the function.
revoke all on public.connections from anon, authenticated;
grant select (user_id, provider, account_email, status, synced_at, created_at)
  on public.connections to authenticated;

-- Which calendar event stands for which tracker date, so a sync updates
-- instead of duplicating. key is "<job_id>:deadline|remind|interview".
create table public.calendar_events (
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  key text not null,
  event_id text not null,
  hash text not null,                -- of what we last sent; unchanged means skip
  primary key (user_id, provider, key)
);
alter table public.calendar_events enable row level security; -- service role only

-- OAuth round trips in flight: the state Google hands back, tied to who started it.
create table public.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users on delete cascade,
  provider text not null,
  redirect_uri text not null,
  time_zone text not null,
  created_at timestamptz not null default now()
);
alter table public.oauth_states enable row level security; -- service role only

-- Subscribe feeds -----------------------------------------------------------------

-- The token is the whole secret, like Google's own "secret address in iCal
-- format": anyone with the link sees the tracker's dates. Resetting it
-- (deleting the row and making a new one) kills the old link.
create table public.calendar_feeds (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  token text not null unique default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
create policy "own feed" on public.calendar_feeds for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
