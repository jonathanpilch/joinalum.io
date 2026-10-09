# joinalum.io

Alum: a school-specific explore board for internships and early career roles, in the style of [Runway's explore page](https://app.joinrunway.io/explore), dressed in Ndex's glass look (`NuBlock.co/public/app/glass.css`). Proof of concept.

Built by Hokies for tech students: internships, co-ops and new-grad roles, pulled hourly straight from companies' own career boards.

```
index.html, styles.css, app.js   the page (reads data/jobs.json)
schools.js                       per-school identity: name, demonym, mark, backdrop
ingest/companies.mjs             who we pull from, and which ATS board each uses
ingest/sources.mjs               one fetcher per ATS: Greenhouse, Lever, Ashby, SmartRecruiters, Workday, Amazon
ingest/classify.mjs              rules: early-career? tech? US? plus location, arrangement, start term, pay
ingest/run.mjs                   runs it all, keeps first-seen times, writes data/
ingest/placements.mjs            VT's First Destination Report -> where Hokies got hired, by employer and major
ingest/match.mjs                 employer-name matching ("Northrop Grumman Mission Systems" = Northrop Grumman)
data/jobs.json                   what the page shows
data/state.json                  first time we saw each posting (our freshness clock)
data/placements.json             ~25k anonymous VT placements, 2014-2025, rolled up by employer
.github/workflows/ingest.yml     runs the ingest hourly and commits data/
```

## Accounts (optional)

Without Supabase config the site runs signed-out, everything on the device. With it, students sign in with their school email (`allowed_domains` in the migration; anything else is refused at sign-up) and get:

- profile, saved internships (status history, deadline, reminder date, notes) and radars synced across devices
- **radars**: any search saved with *Alert me*, emailed within the hour, daily or weekly (`ingest/notify.mjs`, after each ingest), never repeating a posting, never showing one their profile rules out
- **reminders** by email on the date they set on a saved internship
- **resume to profile**: Claude reads the PDF (`supabase/functions/parse-resume`), the student reviews the suggestions; the file isn't stored, work status is never guessed, 10 reads per student per day
- **interview notes** from other students at each company, readable signed-in only and never with the author's name

```
lib/core.js                          fit + matching, shared by the page and the notifier
lib/account.js                       sign-in and sync (supabase-js, loaded only when configured)
supabase/migrations/…_accounts.sql   tables, row-level security, notifier functions
supabase/functions/parse-resume/     resume PDF -> profile fields (Claude)
ingest/notify.mjs                    radar + reminder emails (Resend)
scripts/config.mjs                   writes config.js (URL + publishable key) from the environment
```

### Accounts setup

1. **Keys** go in `.env` (see `.env.example`; never committed): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (the secret key), `RESEND_API_KEY`, `ANTHROPIC_API_KEY`.
2. **Database**: run `supabase/migrations/20261009000000_alum_accounts.sql` once, in the Supabase dashboard's SQL editor, or `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. **Auth** (dashboard > Authentication): Site URL `https://joinalum.io`; add `http://localhost:5178/**` to redirect URLs for local dev. Under SMTP, send through Resend (`smtp.resend.com`, port 465, user `resend`, password = the Resend key, sender on your verified domain). Supabase's built-in mailer only sends a few sign-in emails an hour.
4. **Resume reading**: `npx supabase functions deploy parse-resume --project-ref <ref>`, then `npx supabase secrets set ANTHROPIC_API_KEY=<key> --project-ref <ref>`.
5. **Emails**: verify `joinalum.io` in Resend. GitHub repo > Settings > Secrets and variables > Actions: secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`; variable `ALUM_FROM` (e.g. `Alum <alerts@joinalum.io>`).
6. **Site**: in the Cloudflare build's variables, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. Only those two ever reach the browser.

`npm run notify -- --dry` prints the emails that are due without sending them.

## Run it

```
npm run ingest        # ~1-2 min, all boards
npm run placements    # VT placement report (weekly in CI)
npm run dev           # http://localhost:5178
```

`node ingest/run.mjs stripe ngc` re-pulls just those boards (slug, Workday tenant or name) and merges.

## Adding a company

Find its board: `boards-api.greenhouse.io/v1/boards/{slug}/jobs`, `api.lever.co/v0/postings/{slug}`, `api.ashbyhq.com/posting-api/job-board/{slug}`, `api.smartrecruiters.com/v1/companies/{slug}/postings`, or for Workday the `{tenant}.wdN.myworkdayjobs.com/{site}` in its careers URL. Add a line to `ingest/companies.mjs`. `npm run placements` prints the biggest VT employers not on the board yet -- start there.

## How it decides

- **Early-career:** intern/co-op/new-grad/entry-level language in the title wins over seniority words; "Senior", "Staff", "II", "Manager" drop it; a title with no signal is kept only if the posting asks for at most a year of experience (shown as "Why it's here" on the card). Recruiter roles are dropped.
- **Tech:** the title has to land in a function (Software, Hardware, AI/ML, Data, Security, Cloud/IT, Product, Design, Engineering, Research, Quant, Tech Consulting).
- **US only**, with locations normalized to city + state.
- **Freshness:** the board's own publish time when it gives one (Greenhouse, Lever, Ashby, SmartRecruiters), else the posting day (Workday's "Posted N days ago", Amazon, Bank of America) clamped to when we first saw it. The page shows both clocks: when the employer posted, and how long after that Alum had it. The headline lag is the median over the last 14 days of postings with an exact board time.
- **Who can apply:** `eligibility()` in `classify.mjs` reads the graduation window, "return to school after", PhD/grad-only, US citizenship, clearance (active vs. can-obtain, and the level), no sponsorship, and a GPA floor out of the posting text; `skills()` picks named tools from a fixed list. Only what the posting says: unset means not stated. The page marks each against the profile as fits, a gap, or rules you out, and hides the last by default.
- **Hokie signal:** every card carries how many VT grads the employer hired (First Destination Report) and how many from your major.

## Not built yet

Alumni on each team (opt-in), a career-services view.
