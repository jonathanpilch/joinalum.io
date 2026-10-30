/* The ingest. Pull every board in companies.mjs, keep what's early-career,
 * tech, and in the US, and write data/jobs.json for the page.
 *
 *   node ingest/run.mjs              all boards
 *   node ingest/run.mjs stripe ngc   just these (slug or tenant), merged into
 *                                    the existing jobs.json
 *
 * Freshness is the product, so we keep our own clock: data/state.json holds
 * the first time we ever saw each posting. A job's "posted" time is the
 * board's own timestamp when it has one we trust, else when we first saw it --
 * run this hourly and that's never more than an hour off. */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import companies from "./companies.mjs";
import { fetchers } from "./sources.mjs";
import { level, fn, places, arrangement, term, pay, yearsMin, locationLabel, eligibility, skills } from "./classify.mjs";

const ROOT = new URL("../", import.meta.url);
const OUT = new URL("data/jobs.json", ROOT);
const STATE = new URL("data/state.json", ROOT);
const CONCURRENCY = 8;
const KEEP_DAYS = 60; // drop postings older than this from the board

const only = process.argv.slice(2);
const targets = only.length ? companies.filter((c) => only.includes(c.slug) || only.includes(c.tenant) || only.includes(c.name)) : companies;

const readJson = async (u, d) => { try { return JSON.parse(await readFile(u, "utf8")); } catch { return d; } };
const state = await readJson(STATE, { firstSeen: {} });
const previous = await readJson(OUT, { jobs: [] });
const now = new Date();
const nowIso = now.toISOString();

async function pool(items, n, fnc) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fnc(items[k]); } }));
  return out;
}

const report = [];
const results = await pool(targets, CONCURRENCY, async (c) => {
  const t0 = Date.now();
  try {
    const fetcher = fetchers[c.ats];
    let raw = await fetcher(c);
    // Boards with a detail call (Workday): fetch it only for postings that
    // already pass on title, then judge again with the full posting.
    if (fetcher.detail) {
      const pre = raw.filter((r) => level(r.title, r.employment || "", r.text) && fn(r.title));
      raw = await pool(pre, 6, (r) => fetcher.detail(c, r).catch(() => r));
    }
    const kept = [];
    for (const r of raw) {
      const lvl = level(r.title, r.employment || "", r.text);
      if (!lvl) continue;
      const f = fn(r.title);
      if (!f) continue;
      const locs = places(r.locations);
      if (!locs) continue;
      const job = shape(c, r, lvl, f, locs);
      // Kept on the posting's text alone, not its title: say so on the card.
      if (!level(r.title, r.employment || "", "")) job.fromPosting = true;
      kept.push(job);
    }
    report.push({ company: c.name, ats: c.ats, fetched: raw.length, kept: kept.length, ms: Date.now() - t0 });
    return kept;
  } catch (e) {
    report.push({ company: c.name, ats: c.ats, error: String(e.message || e), ms: Date.now() - t0 });
    return null; // keep last run's jobs for this company
  }
});

function shape(c, r, lvl, f, locs) {
  const id = `${c.ats}:${c.slug || c.tenant || (c.ats === "amzn" ? "amzn" : c.name)}:${r.sourceId}`;
  const firstSeenAt = state.firstSeen[id] || nowIso;
  state.firstSeen[id] = firstSeenAt;
  // The board's own timestamp when it's exact and sane, else our first
  // sighting. Workday's "Posted Today" is only an upper bound, so it can
  // never be later than when we first saw the posting.
  let postedAt = r.postedAt && Date.parse(r.postedAt) <= now.getTime() ? r.postedAt : firstSeenAt;
  if (r.postedApprox && Date.parse(firstSeenAt) < Date.parse(postedAt)) postedAt = firstSeenAt;
  const elig = eligibility(r.title, r.text);
  const sk = skills(`${r.title} ${r.text || ""}`);
  return {
    id,
    title: r.title.replace(/\s+/g, " ").trim(),
    company: c.name,
    domain: c.domain,
    sector: c.sector,
    ats: c.ats,
    url: r.url,
    level: lvl,
    fn: f,
    location: locationLabel(locs),
    states: [...new Set(locs.map((l) => l.state).filter(Boolean))],
    arrangement: arrangement(r.workplace, locs, r.text),
    term: term(r.title, r.text),
    yearsMin: yearsMin(r.text),
    pay: pay(r.pay, r.text),
    postedAt,
    postedApprox: !!r.postedApprox,
    firstSeenAt,
    // What the posting says about who can apply, and the tools it names.
    // Unset when it says nothing (or the board gives us no description).
    ...(elig && { elig }),
    ...(sk.length && { skills: sk }),
  };
}

// Merge: fresh results replace a company's jobs; a failed board keeps its
// last good set; a partial run keeps everyone it didn't touch.
const touched = new Set(targets.filter((_, i) => results[i]).map((c) => c.name));
let jobs = previous.jobs.filter((j) => j.ats !== "fantastic" && !touched.has(j.company));
for (const r of results) if (r) jobs.push(...r);

// fantastic.jobs rows (from ingest/fantastic.mjs, idle since the trial ended)
// go in after the direct ones, so a direct copy of the same posting wins the
// merge below. Never for a company we now pull ourselves, and a month after
// posting at most, since nothing refreshes them.
const fantastic = await readJson(new URL("data/fantastic-jobs.json", ROOT), { jobs: [] });
const direct = new Set(companies.map((c) => c.name));
jobs.push(...fantastic.jobs.filter((j) => !direct.has(j.company) && now - Date.parse(j.postedAt) < 30 * 864e5));

// Same title, same company, same level, posted as separate reqs per city:
// one row, every location.
const byKey = new Map();
for (const j of jobs) {
  const k = `${j.company}|${j.title.toLowerCase()}|${j.level}`;
  const prev = byKey.get(k);
  if (!prev) { byKey.set(k, j); continue; }
  prev.states = [...new Set([...prev.states, ...j.states])];
  prev.extraLocations = (prev.extraLocations || 0) + 1;
  if (Date.parse(j.postedAt) > Date.parse(prev.postedAt)) prev.postedAt = j.postedAt;
}
jobs = [...byKey.values()].map(({ extraLocations: n, ...j }) => (n && !j.location.includes("more") ? { ...j, location: `${j.location} + ${n} more` } : j));
jobs = jobs.filter((j) => now - Date.parse(j.postedAt) < KEEP_DAYS * 864e5);
jobs.sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));

// Forget sightings of postings gone for a month, so state.json stays small.
const live = new Set(jobs.map((j) => j.id));
for (const [id, seen] of Object.entries(state.firstSeen)) if (!live.has(id) && now - Date.parse(seen) > 30 * 864e5) delete state.firstSeen[id];

await mkdir(new URL("data/", ROOT), { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: nowIso, companies: companies.length, jobs }));
await writeFile(STATE, JSON.stringify(state));

report.sort((a, b) => (b.kept || 0) - (a.kept || 0));
const failed = report.filter((r) => r.error);
for (const r of report) console.log(`${r.error ? "✗" : "✓"} ${r.company.padEnd(22)} ${r.ats.padEnd(4)} ${r.error ? r.error : `${String(r.kept).padStart(4)} / ${r.fetched}`}  ${(r.ms / 1000).toFixed(1)}s`);
const day = jobs.filter((j) => now - Date.parse(j.postedAt) < 864e5).length;
console.log(`\n${jobs.length} roles from ${new Set(jobs.map((j) => j.company)).size} companies · ${day} in the last 24h · ${failed.length} boards failed`);
