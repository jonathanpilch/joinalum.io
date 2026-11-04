/* Alumni: Hokies who work at the companies on the board.
 *
 *   node ingest/alumni.mjs
 *
 * Two sources, each incremental -- every run does what its budget allows and
 * picks up where the last left off, so the hourly job fills this in over time:
 *
 *   github   GitHub's public user search for Virginia Tech in bio/location,
 *            then each profile's `company` field. No key needed (60 profiles
 *            an hour); GITHUB_TOKEN raises it to 1,000+.
 *   search   Public LinkedIn profiles found through a search API:
 *              site:linkedin.com/in "Virginia Tech" "Northrop Grumman"
 *            Needs BRAVE_API_KEY (api.search.brave.com, 2k free queries/mo)
 *            or SERPER_API_KEY (serper.dev, Google results, 2.5k free).
 *            Skipped without one.
 *
 * Output is personal data, so it lives in data/private/ (gitignored). */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import companies from "./companies.mjs";

const ROOT = new URL("../", import.meta.url);
const DIR = new URL("data/private/", ROOT);
const OUT = new URL("alumni.json", DIR);
const STATE = new URL("alumni-state.json", DIR);

const SCHOOL = {
  name: "Virginia Tech",
  // Anything in a bio/location/headline that marks a Hokie.
  marks: /\b(virginia tech|virginia polytechnic|hokies?|vt\.edu|@vt\b|blacksburg)\b/i,
  // Class year: "VT '24", "Virginia Tech 2023", "Class of 2025", "BS CS 2022 Virginia Tech"
  year: /(?:virginia tech|vt|hokies?)\D{0,12}(?:'|’|20)(\d{2})\b|class of 20(\d{2})\b|\b20(\d{2})\D{0,25}virginia tech/i,
};

const GH_QUERIES = [
  '"virginia tech" in:bio created:<2016-01-01',
  '"virginia tech" in:bio created:2016-01-01..2019-12-31',
  '"virginia tech" in:bio created:2020-01-01..2022-12-31',
  '"virginia tech" in:bio created:>2022-12-31',
  "hokie in:bio",
  '"virginia polytechnic" in:bio',
  'location:"virginia tech"',
  "location:blacksburg created:<2018-01-01",
  "location:blacksburg created:>2017-12-31",
];
const PROFILE_TTL = 30 * 864e5; // re-read a profile monthly
const SEARCH_TTL = 7 * 864e5; // re-run a company search weekly

const readJson = async (u, d) => { try { return JSON.parse(await readFile(u, "utf8")); } catch { return d; } };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const state = await readJson(STATE, { github: { users: {}, searchedAt: {} }, search: { results: {}, searchedAt: {} } });
const now = Date.now();

// Company matching ------------------------------------------------------
//
// A profile says "@northropgrumman", "Raytheon Technologies", "AWS". Map it
// to a board company or nothing.

const ALIASES = {
  "Amazon": ["amazon web services", "aws", "annapurna labs", "amazon"],
  "RTX": ["rtx", "raytheon", "collins aerospace", "pratt & whitney", "pratt and whitney"],
  "GDIT": ["gdit", "general dynamics information technology", "general dynamics it"],
  "Booz Allen Hamilton": ["booz allen", "boozallen", "bah"],
  "Northrop Grumman": ["northrop grumman", "northropgrumman", "northrop"],
  "Capital One": ["capital one", "capitalone", "c1"],
  "IMC Trading": ["imc trading", "imc"],
  "Scale AI": ["scale ai", "scaleai"],
  "SpaceX": ["spacex", "space exploration technologies"],
  "Disney": ["disney", "walt disney"],
  "HP": ["hp inc", "hp"],
  "Leidos": ["leidos"],
  "CACI": ["caci"],
  "Jane Street": ["jane street", "janestreet"],
  "Point72": ["point72", "cubist"],
  "Freddie Mac": ["freddie mac", "freddiemac"],
  "Fannie Mae": ["fannie mae", "fanniemae"],
  "Western Digital": ["western digital", "wdc"],
  "Palantir": ["palantir"],
  "NVIDIA": ["nvidia"],
};
const norm = (s) => s.toLowerCase().replace(/^@/, "").replace(/[.,]/g, " ").replace(/\b(inc|llc|corp|corporation|co|company|ltd|technologies|labs?)\b\.?/g, " ").replace(/\s+/g, " ").trim();
const matchers = companies.map((c) => {
  const names = [...new Set([c.name, c.slug, ...(ALIASES[c.name] || [])].filter(Boolean).map(norm))].filter((n) => n.length > 1);
  return { name: c.name, re: new RegExp(`(^|[^a-z0-9])(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})([^a-z0-9]|$)`, "i") };
});
export function companyOf(text) {
  if (!text) return null;
  const t = norm(text);
  // Prefer the longest name that matches, so "capital one" beats "c1".
  let best = null;
  for (const m of matchers) { const hit = m.re.exec(t); if (hit && (!best || hit[2].length > best.len)) best = { name: m.name, len: hit[2].length }; }
  return best?.name || null;
}
const classYear = (...texts) => {
  for (const t of texts) { const m = t && SCHOOL.year.exec(t); if (m) { const y = Number(`20${m[1] || m[2] || m[3]}`); if (y >= 1990 && y <= 2032) return y; } }
  return null;
};

// GitHub ----------------------------------------------------------------

const ghHeaders = { accept: "application/vnd.github+json", "user-agent": "joinalum-ingest", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
let ghRemaining = { core: Infinity, search: Infinity };

async function gh(path, kind = "core") {
  if (ghRemaining[kind] <= 1) return null;
  const r = await fetch(`https://api.github.com${path}`, { headers: ghHeaders, signal: AbortSignal.timeout(20000) });
  ghRemaining[kind] = Number(r.headers.get("x-ratelimit-remaining") ?? ghRemaining[kind]);
  if (r.status === 403 || r.status === 429) { ghRemaining[kind] = 0; return null; }
  if (!r.ok) return null;
  return r.json();
}

async function github() {
  const g = state.github;
  let found = 0;
  // 1. Discover Hokie logins (search API: ~10/min without a token).
  for (const q of GH_QUERIES) {
    if (now - (g.searchedAt[q] || 0) < SEARCH_TTL) continue;
    for (let page = 1; page <= 10; page++) {
      const j = await gh(`/search/users?q=${encodeURIComponent(q)}&per_page=100&page=${page}`, "search");
      if (!j) break;
      for (const u of j.items || []) if (!g.users[u.login]) { g.users[u.login] = { fetchedAt: 0 }; found++; }
      if ((j.items || []).length < 100) { g.searchedAt[q] = now; break; }
      await sleep(process.env.GITHUB_TOKEN ? 2100 : 6500);
    }
  }
  // 2. Read profiles, oldest first, until the budget runs out.
  const queue = Object.entries(g.users).filter(([, u]) => now - u.fetchedAt > PROFILE_TTL).sort((a, b) => a[1].fetchedAt - b[1].fetchedAt).map(([login]) => login);
  let read = 0;
  for (const login of queue) {
    const p = await gh(`/users/${login}`);
    if (!p) break;
    g.users[login] = {
      fetchedAt: now,
      name: p.name || null,
      company: p.company || null,
      bio: p.bio || null,
      location: p.location || null,
      blog: p.blog || null,
      avatar: p.avatar_url,
      type: p.type,
    };
    read++;
  }
  return { discovered: found, profilesRead: read, queued: queue.length - read, total: Object.keys(g.users).length };
}

function githubPeople() {
  const out = [];
  for (const [login, u] of Object.entries(state.github.users)) {
    if (!u.fetchedAt || u.type !== "User") continue;
    const hay = [u.bio, u.location, u.company].filter(Boolean).join(" · ");
    if (!SCHOOL.marks.test(hay)) continue; // a Blacksburg location alone isn't enough...
    if (!/virginia tech|virginia polytechnic|hokie|vt\.edu/i.test(hay) && /blacksburg/i.test(u.location || "") && !u.company) continue; // ...unless they work somewhere
    // Company from the company field first; a bio "SWE @ Capital One" second.
    const company = companyOf(u.company) || companyOf((u.bio || "").replace(/virginia tech|virginia polytechnic/gi, ""));
    if (!company) continue;
    out.push({
      id: `gh:${login}`,
      name: u.name || login,
      headline: u.bio ? u.bio.slice(0, 140) : u.company,
      company,
      classYear: classYear(u.bio),
      student: /\b(student|undergrad|freshman|sophomore|junior|senior|intern|candidate|'2[6-9]|20(2[6-9]))\b/i.test(u.bio || "") && /virginia tech|hokie|vt/i.test(u.bio || ""),
      source: "GitHub",
      url: `https://github.com/${login}`,
      avatar: u.avatar,
    });
  }
  return out;
}

// Search API (public LinkedIn profiles) --------------------------------

async function searchApi(q) {
  if (process.env.SERPER_API_KEY) {
    const r = await fetch("https://google.serper.dev/search", { method: "POST", headers: { "x-api-key": process.env.SERPER_API_KEY, "content-type": "application/json" }, body: JSON.stringify({ q, num: 20 }) });
    if (!r.ok) throw new Error(`serper ${r.status}`);
    return ((await r.json()).organic || []).map((x) => ({ title: x.title, url: x.link, snippet: x.snippet || "" }));
  }
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20`, { headers: { "x-subscription-token": process.env.BRAVE_API_KEY, accept: "application/json" } });
  if (!r.ok) throw new Error(`brave ${r.status}`);
  return ((await r.json()).web?.results || []).map((x) => ({ title: x.title, url: x.url, snippet: (x.description || "").replace(/<[^>]+>/g, "") + " " + (x.extra_snippets || []).join(" ") }));
}

async function search() {
  if (!process.env.SERPER_API_KEY && !process.env.BRAVE_API_KEY) return { skipped: "no BRAVE_API_KEY or SERPER_API_KEY" };
  const s = state.search;
  let queries = 0;
  for (const c of companies) {
    if (now - (s.searchedAt[c.name] || 0) < SEARCH_TTL) continue;
    const q = `site:linkedin.com/in "${SCHOOL.name}" "${c.name}"`;
    try {
      s.results[c.name] = await searchApi(q);
      s.searchedAt[c.name] = now;
      queries++;
    } catch (e) {
      console.log(`  search stopped at ${c.name}: ${e.message}`);
      break;
    }
    await sleep(1100); // Brave free tier: 1 query/sec
  }
  return { queries };
}

/* "Jane Doe - Software Engineer - Northrop Grumman | LinkedIn" plus a snippet
 * like "Experience: Northrop Grumman · Education: Virginia Tech · Location:
 * Falls Church". Keep it only if both the school and the company show up and
 * the company isn't just a past job. */
function searchPeople() {
  const out = [];
  for (const [companyName, results] of Object.entries(state.search.results)) {
    for (const r of results) {
      if (!/linkedin\.com\/in\//.test(r.url)) continue;
      const title = r.title.replace(/\s*[|·-]\s*LinkedIn\s*$/i, "");
      const parts = title.split(/\s+[-–|]\s+/);
      const name = parts[0]?.trim();
      if (!name || name.split(" ").length > 5) continue;
      const hay = `${title} ${r.snippet}`;
      if (!SCHOOL.marks.test(hay)) continue;
      const exp = /Experience:\s*([^·|]+)/i.exec(r.snippet)?.[1];
      const current = companyOf(exp) || companyOf(parts.slice(1).join(" ")) || (/\bat\s+/i.test(r.snippet) && companyOf(/\bat\s+([^·.,|]+)/i.exec(r.snippet)?.[1]));
      if (current !== companyName) continue;
      out.push({
        id: `li:${r.url.split("/in/")[1].replace(/\/.*$/, "")}`,
        name,
        headline: parts.slice(1).join(" · ") || r.snippet.slice(0, 140),
        company: companyName,
        classYear: classYear(r.snippet, title),
        student: /\bintern\b/i.test(parts[1] || ""),
        source: "LinkedIn",
        url: r.url.split("?")[0],
        avatar: null,
      });
    }
  }
  return out;
}

// Run -------------------------------------------------------------------

console.log(`github: ${JSON.stringify(await github())}`);
console.log(`search: ${JSON.stringify(await search())}`);

const people = new Map();
for (const p of [...searchPeople(), ...githubPeople()]) if (!people.has(p.id)) people.set(p.id, p);
const list = [...people.values()].sort((a, b) => a.company.localeCompare(b.company) || (b.classYear || 0) - (a.classYear || 0));
const byCompany = {};
for (const p of list) byCompany[p.company] = (byCompany[p.company] || 0) + 1;

await mkdir(DIR, { recursive: true });
await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), school: SCHOOL.name, byCompany, people: list }));
await writeFile(STATE, JSON.stringify(state));

console.log(`\n${list.length} Hokies matched at ${Object.keys(byCompany).length} board companies`);
for (const [c, n] of Object.entries(byCompany).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(3)}  ${c}`);
