/* Internships at the target employers we can't pull directly, from
 * fantastic.jobs' Active Jobs DB. Credits are spent per job returned, so:
 *
 *   - only the `fantastic` targets in data/targets.json are queried, never a
 *     company we already pull ourselves;
 *   - only jobs indexed since the last run (date_created_gte), so nothing is
 *     paid for twice;
 *   - only US internships (ai_employment_type=INTERN).
 *
 *   node --env-file=.env ingest/fantastic.mjs           daily (trial) / hourly (paid)
 *   node --env-file=.env ingest/fantastic.mjs --probe   one small call per batch,
 *                                                       prints what came back, saves nothing
 *
 * Needs FANTASTIC_KEY (in .env locally, a repo secret in CI). Writes
 * data/fantastic-jobs.json, which run.mjs merges into data/jobs.json. */

import { readFile, writeFile } from "node:fs/promises";
import { level, fn, places, locationLabel, term, eligibility, skills } from "./classify.mjs";
import { key } from "./match.mjs";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/fantastic-jobs.json", ROOT);
const API = "https://data.fantastic.jobs/v1/active-ats";
const PAGE = 100;
const MAX_PAGES = 10; // per batch per run: a runaway query can't drain the plan
const KEEP_DAYS = 30; // hide a posting a month after it went up (no expired feed on the trial)
const PROBE = process.argv.includes("--probe");

const KEY = process.env.FANTASTIC_KEY;
if (!KEY) {
  console.error("FANTASTIC_KEY is not set. Put it in .env (FANTASTIC_KEY=...) and run with node --env-file=.env");
  process.exit(1);
}

const readJson = async (u, d) => { try { return JSON.parse(await readFile(u, "utf8")); } catch { return d; } };
const { targets } = await readJson(new URL("data/targets.json", ROOT), { targets: [] });
const store = await readJson(OUT, { lastCreatedAt: null, jobs: [] });
const now = new Date();

const mine = targets.filter((t) => t.source === "fantastic");
const byDomain = new Map(mine.flatMap((t) => (t.domains || []).map((d) => [d, t])));
const byName = new Map(mine.map((t) => [key(t.name), t]));

// Batches: domains in groups that keep the URL short, plus one by-name batch
// for targets whose domain we aren't sure of.
const domains = [...byDomain.keys()];
const batches = [];
for (let i = 0; i < domains.length; i += 40) batches.push({ domain: domains.slice(i, i + 40).join(",") });
const unnamed = mine.filter((t) => !t.domains);
if (unnamed.length) batches.push({ organization: unnamed.map((t) => t.name.replace(/,? (inc|llc|corp)\.?$/i, "")).join(",") });

const since = store.lastCreatedAt || new Date(now - 7 * 864e5).toISOString();

async function call(params) {
  const url = `${API}?${new URLSearchParams(params)}`;
  const r = await fetch(url, { headers: { authorization: `Bearer ${KEY}`, accept: "application/json" }, signal: AbortSignal.timeout(60000) });
  const quota = [...r.headers].filter(([k]) => /ratelimit|quota|remaining|credits/i.test(k)).map(([k, v]) => `${k}=${v}`).join(" ");
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const body = await r.json();
  return { jobs: Array.isArray(body) ? body : body.jobs || body.data || [], quota };
}

// Fetch ---------------------------------------------------------------------

const raw = [];
let requests = 0;
let lastQuota = "";
for (const b of batches) {
  for (let page = 0; page < (PROBE ? 1 : MAX_PAGES); page++) {
    const params = {
      ...b,
      ai_employment_type: "INTERN",
      location: "United States",
      time_frame: "7d",
      date_created_gte: since,
      limit: String(PROBE ? 5 : PAGE),
      offset: String(page * PAGE),
      include_basic_organization_details: "true",
      description_format: "text",
    };
    const { jobs, quota } = await call(params);
    requests++;
    lastQuota = quota || lastQuota;
    raw.push(...jobs);
    if (PROBE) console.log(`batch ${batches.indexOf(b) + 1}/${batches.length} (${b.domain ? "domains" : "names"}): ${jobs.length} back · ${quota}`);
    if (jobs.length < PAGE) break;
  }
}

if (PROBE) {
  for (const j of raw.slice(0, 10)) console.log(`  ${j.organization} | ${j.title} | ${(j.locations_derived || []).join("; ")} | ${j.domain_derived || j.source_domain} | created ${j.date_created}`);
  console.log(`\n${requests} requests, ${raw.length} jobs (each costs a credit). Probe saves nothing.`);
  process.exit(0);
}

// Shape ---------------------------------------------------------------------

function target(j) {
  return byDomain.get((j.domain_derived || "").replace(/^www\./, "")) || byName.get(key(j.organization || "")) || null;
}

function salary(j) {
  const lo = j.ai_salary_min_value ?? j.ai_salary_value, hi = j.ai_salary_max_value ?? lo;
  if (!lo) return null;
  const unit = (j.ai_salary_unit_text || "").toUpperCase();
  if (unit === "HOUR") return `$${Math.round(lo)}${hi && hi !== lo ? `–$${Math.round(hi)}` : ""}/hr`;
  if (unit === "YEAR") return `$${Math.round(lo / 1000)}k${hi && hi !== lo ? `–$${Math.round(hi / 1000)}k` : ""}`;
  return null;
}

const ARRANGEMENT = { "On-site": "On-site", Hybrid: "Hybrid", "Remote OK": "Remote OK", "Remote Solely": "Remote" };

const fresh = [];
const dropped = { noTarget: 0, notIntern: 0, notUS: 0 };
for (const j of raw) {
  const t = target(j);
  if (!t) { dropped.noTarget++; continue; }
  // Their AI says intern; our title rules have to agree (Internship or Co-op).
  const lvl = level(j.title, "intern", "");
  if (lvl !== "Internship" && lvl !== "Co-op") { dropped.notIntern++; continue; }
  const locs = places(j.locations_derived || []);
  if (!locs) { dropped.notUS++; continue; }
  const text = [j.ai_core_responsibilities, j.ai_requirements_summary].filter(Boolean).join(" ");
  fresh.push({
    id: `fantastic:${j.id}`,
    title: j.title.replace(/\s+/g, " ").trim(),
    company: t.name,
    domain: (t.domains || [])[0] || j.domain_derived || null,
    sector: j.org_linkedin_industry || "Other",
    ats: "fantastic",
    via: j.source || null, // the ATS fantastic.jobs read it from
    url: j.url,
    level: lvl,
    fn: fn(j.title) || "Other",
    location: locationLabel(locs),
    states: [...new Set(locs.map((l) => l.state).filter(Boolean))],
    arrangement: ARRANGEMENT[j.ai_work_arrangement] || "On-site",
    term: term(j.title, text),
    yearsMin: null,
    pay: salary(j),
    summary: j.ai_core_responsibilities || null,
    requirements: j.ai_requirements_summary || null,
    skills: skills(`${j.title} ${text}`, j.ai_key_skills || []),
    elig: eligibility(j.title, [text, j.description_text].filter(Boolean).join(" ")) || undefined,
    postedAt: j.date_posted || j.date_created,
    postedApprox: false,
    firstSeenAt: now.toISOString(),
    createdAt: j.date_created,
  });
}

// Merge with what we already have; keep the earliest sighting.
const byId = new Map(store.jobs.map((j) => [j.id, j]));
for (const j of fresh) byId.set(j.id, byId.has(j.id) ? { ...j, firstSeenAt: byId.get(j.id).firstSeenAt } : j);
const jobs = [...byId.values()].filter((j) => now - Date.parse(j.postedAt) < KEEP_DAYS * 864e5);
const newest = raw.map((j) => j.date_created).filter(Boolean).sort().at(-1);

await writeFile(OUT, JSON.stringify({
  generatedAt: now.toISOString(),
  lastCreatedAt: newest || store.lastCreatedAt || since,
  jobs,
}));

console.log(`${requests} requests · ${raw.length} jobs returned (credits) · ${fresh.length} kept · dropped ${JSON.stringify(dropped)}`);
console.log(`store: ${jobs.length} internships at ${new Set(jobs.map((j) => j.company)).size} companies${lastQuota ? ` · ${lastQuota}` : ""}`);
