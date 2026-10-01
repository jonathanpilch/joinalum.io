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
data/jobs.json                   what the page shows
data/state.json                  first time we saw each posting (our freshness clock)
.github/workflows/ingest.yml     runs the ingest hourly and commits data/
```

## Run it

```
npm run ingest        # ~1-2 min, all boards
npm run dev           # http://localhost:5178
```

`node ingest/run.mjs stripe ngc` re-pulls just those boards (slug, Workday tenant or name) and merges.

## Adding a company

Find its board: `boards-api.greenhouse.io/v1/boards/{slug}/jobs`, `api.lever.co/v0/postings/{slug}`, `api.ashbyhq.com/posting-api/job-board/{slug}`, `api.smartrecruiters.com/v1/companies/{slug}/postings`, or for Workday the `{tenant}.wdN.myworkdayjobs.com/{site}` in its careers URL. Add a line to `ingest/companies.mjs`; set `vt: true` if it recruits hard out of VT.

## How it decides

- **Early-career:** intern/co-op/new-grad/entry-level language in the title wins over seniority words; "Senior", "Staff", "II", "Manager" drop it; a title with no signal is kept only if the posting asks for at most a year of experience (shown as "Why it's here" on the card). Recruiter roles are dropped.
- **Tech:** the title has to land in a function (Software, Hardware, AI/ML, Data, Security, Cloud/IT, Product, Design, Engineering, Research, Quant, Tech Consulting).
- **US only**, with locations normalized to city + state.
- **Freshness:** the board's own publish time when it gives one (Greenhouse, Lever, Ashby, SmartRecruiters, Amazon), else Workday's "Posted N days ago" clamped to when we first saw it.

## Not built yet

Alumni on each team, match scores, alerts.
