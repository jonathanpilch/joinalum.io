/* Where Hokies actually got hired: VT's First Destination Report.
 *
 *   node ingest/placements.mjs
 *
 * Career and Professional Development publishes every graduating cohort's
 * reported outcome -- major, employer, title, city -- at fds.career.vt.edu.
 * No names. This rolls those rows up by employer and writes
 * data/placements.json, which the page reads for "Hokies hired here",
 * the pipeline filter and "hires my major". It also prints the biggest VT
 * employers we don't pull jobs from yet. VT publishes once a year; weekly
 * is plenty.
 *
 * Starting salaries come from a second VT source, the First Destination
 * dashboard behind career.vt.edu ("uConnect"): median full-time salary by
 * employer, and by employer and major, classes of 2020 on. VT hides any
 * group under 10 salaries, so only the biggest employers have one. */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { canonical, key, board } from "./match.mjs";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/placements.json", ROOT);
const BASE = "https://fds.career.vt.edu/EmployerList";
const SALARY_API = "https://career.vt.edu/api/uconnect/v1/odv/get-data";
const SALARY_PAGE = "https://vt.uconnectlabs.com/outcomes/";
const UA = "joinalum-ingest (student project)";
const FIRST = 2013; // earliest cohort with data (2013-2014)
const RECENT = 3; // "recent" = the last three cohorts with data

const thisYear = new Date().getFullYear();
const cohorts = [];
for (let y = FIRST; y <= thisYear; y++) cohorts.push(`${y}-${y + 1}`);

const decode = (s) => s.replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const NA = /^-*\s*not applicable$|^'?-+$|^$/i;
const clean = (v) => (NA.test(v) ? null : v.replace(/\*+$/, "").trim());
const majorName = (m) => m?.replace(/\s*&\s*/g, " and ");

// One uConnect query: salary count and median, grouped by `groupBy`.
async function salaries(groupBy) {
  const body = {
    data_queries: { a: [{ groupBy, select: { job_salary: ["count", "median"] }, filter: {} }] },
    instance: { id: "default", title: "Default", template: "nace_first_destination", description: "" },
    community: false,
    program: "",
  };
  const r = await fetch(SALARY_API, { method: "POST", headers: { "content-type": "application/json", "user-agent": UA }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const a = (await r.json()).a?.[0];
  if (!a?.data) throw new Error(a?.error || "no data");
  return a.data;
}

async function fetchCohort(c) {
  const r = await fetch(`${BASE}?cohort=${c}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`${c}: HTTP ${r.status}`);
  const html = await r.text();
  const head = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => decode(m[1]));
  const want = ["Major", "Organization", "Title", "Type", "City", "State", "Country"];
  if (want.some((w, i) => head[i] !== w)) throw new Error(`${c}: columns changed (${head.join(", ")})`);
  return html.split(/<tr[\s>]/).slice(1)
    .map((tr) => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1])))
    .filter((cells) => cells.length === 7)
    .map(([major, org, title, type, city, state, country]) => ({ cohort: c, major: majorName(clean(major)), org: clean(org), title: clean(title), type: clean(type)?.toLowerCase().replace("-", " "), city: clean(city), state: clean(state), country: clean(country) }));
}

// Fetch -------------------------------------------------------------------

const rows = [];
const seen = [];
for (const c of cohorts) {
  try {
    const got = await fetchCohort(c);
    if (got.length) { rows.push(...got); seen.push(c); }
    console.log(`${c}  ${String(got.length).padStart(5)} rows`);
  } catch (e) {
    console.log(`${c}  failed: ${e.message}`);
  }
}
if (!rows.length) { console.log("nothing fetched; leaving data/placements.json alone"); process.exit(1); }

// Roll up by employer --------------------------------------------------------

const recentCohorts = new Set(seen.slice(-RECENT));
const tally = (m, k) => k && m.set(k, (m.get(k) || 0) + 1);
const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

const employers = new Map();
const majors = new Map();
let placed = 0;
for (const r of rows) {
  tally(majors, r.major);
  if (!r.org) continue;
  placed++;
  const k = key(r.org);
  if (!k) continue;
  let e = employers.get(k);
  if (!e) employers.set(k, (e = { canonical: canonical(r.org), spellings: new Map(), n: 0, recent: 0, byCohort: new Map(), byMajor: new Map(), titles: new Map(), places: new Map(), partTime: 0 }));
  e.n++;
  if (recentCohorts.has(r.cohort)) e.recent++;
  if (r.type === "part time") e.partTime++;
  tally(e.spellings, r.org);
  tally(e.byCohort, r.cohort);
  tally(e.byMajor, r.major);
  tally(e.titles, r.title);
  tally(e.places, [r.city, r.state && r.country === "United States" ? r.state : r.country].filter(Boolean).join(", "));
}

const out = {};
const boardIndex = {};
const nameByKey = new Map();
for (const [k, e] of employers) {
  const name = e.canonical || top(e.spellings, 1)[0][0];
  const b = board(name);
  // One-offs only matter if they're a board company.
  if (e.n < 2 && !b) continue;
  nameByKey.set(k, name);
  out[name] = {
    n: e.n,
    recent: e.recent,
    board: b,
    byCohort: Object.fromEntries([...e.byCohort.entries()].sort()),
    byMajor: Object.fromEntries(top(e.byMajor, 40)),
    titles: top(e.titles, 12),
    places: top(e.places, 6),
  };
  if (b) boardIndex[b] = name;
}

// Starting salaries ----------------------------------------------------------

// uConnect spells employers its own way ("KPMG LLP"); key() folds them onto
// the report's. Where two spellings land on one employer (Raytheon, Collins
// Aerospace -> RTX), the one with more salaries wins.
let salaryYears = null;
try {
  const [byEmployer, byEmployerMajor, byYear] = await Promise.all([salaries(["job_employer"]), salaries(["job_employer", "major"]), salaries(["year"])]);
  const into = (raw) => out[nameByKey.get(key(raw))];
  for (const { key: org, value: v } of byEmployer) {
    const e = into(org);
    if (e && !(e.salary?.n >= v.count)) e.salary = { n: v.count, median: Math.round(v.median), byMajor: e.salary?.byMajor || {} };
  }
  for (const { key: [org, [major]], value: v } of byEmployerMajor) {
    const e = into(org);
    const m = majorName(major);
    if (e?.salary && m && !(e.salary.byMajor[m]?.n >= v.count)) e.salary.byMajor[m] = { n: v.count, median: Math.round(v.median) };
  }
  const years = byYear.map((y) => y.key).sort();
  salaryYears = [years[0], years.at(-1)];
  const missed = byEmployer.filter((x) => x.key && !into(x.key)).map((x) => x.key);
  console.log(`salaries: ${byEmployer.length - missed.length} of ${byEmployer.length} employers matched${missed.length ? ` (not matched: ${missed.join(", ")})` : ""}`);
} catch (e) {
  // Keep last week's numbers rather than dropping them.
  const prev = await readFile(OUT, "utf8").then(JSON.parse).catch(() => null);
  for (const [name, e] of Object.entries(out)) if (prev?.employers?.[name]?.salary) e.salary = prev.employers[name].salary;
  salaryYears = prev?.salary?.years || null;
  console.log(`salaries failed (${e.message}); kept the last ones`);
}

await mkdir(new URL("data/", ROOT), { recursive: true });
await writeFile(OUT, JSON.stringify({
  source: "Virginia Tech Career and Professional Development, First Destination Report",
  sourceUrl: BASE,
  generatedAt: new Date().toISOString(),
  cohorts: seen,
  recentCohorts: [...recentCohorts],
  rows: rows.length,
  placed,
  majors: top(majors, 500),
  salary: salaryYears && { source: "Virginia Tech First Destination dashboard (uConnect)", sourceUrl: SALARY_PAGE, years: salaryYears },
  boardIndex,
  employers: out,
}));

// Report ----------------------------------------------------------------------

const ranked = Object.entries(out).sort((a, b) => b[1].n - a[1].n);
console.log(`\n${rows.length} graduates across ${seen.length} cohorts, ${placed} with an employer, ${employers.size} distinct employers`);
console.log(`${Object.keys(boardIndex).length} board companies matched\n`);
console.log("Top VT employers we already pull:");
for (const [n, e] of ranked.filter(([, e]) => e.board).slice(0, 15)) console.log(`  ${String(e.n).padStart(4)}  (${String(e.recent).padStart(3)} recent)  ${n}`);
console.log("\nTop VT employers NOT on the board yet:");
for (const [n, e] of ranked.filter(([n, e]) => !e.board && !/^U\.S\.|Virginia Tech/.test(n)).slice(0, 30)) console.log(`  ${String(e.n).padStart(4)}  (${String(e.recent).padStart(3)} recent)  ${n}`);
