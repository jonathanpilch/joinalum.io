/* One fetcher per applicant-tracking system. Each returns raw postings in one
 * shape -- the classifier decides what's early-career, tech, and in the US:
 *
 *   { sourceId, title, locations: [string], url, postedAt (ISO|null),
 *     employment (string|null), workplace (string|null), text (plain|""), pay }
 *
 * All of these are the public JSON the companies' own career pages call. */

const UA = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36", accept: "application/json" };

async function get(url, init = {}, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { ...UA, ...init.headers }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) { const e = new Error(`HTTP ${r.status}`); e.fatal = true; throw e; }
      return await r.json();
    } catch (e) {
      if (e.fatal || i >= tries - 1) throw e;
      await new Promise((ok) => setTimeout(ok, 1000 * 2 ** i + Math.random() * 500));
    }
  }
}

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
export const plain = (html = "") => decode(decode(html)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// Greenhouse -----------------------------------------------------------

async function greenhouse(c) {
  const j = await get(`https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs?content=true`);
  return j.jobs.map((p) => ({
    sourceId: String(p.id),
    title: p.title,
    locations: [p.location?.name, ...(p.offices || []).map((o) => o.location || o.name)].filter(Boolean),
    url: p.absolute_url,
    postedAt: p.first_published || p.updated_at || null,
    employment: null,
    workplace: null,
    text: plain(p.content),
    pay: null,
  }));
}

// Lever ----------------------------------------------------------------

async function lever(c) {
  const j = await get(`https://api.lever.co/v0/postings/${c.slug}?mode=json`);
  return j.map((p) => ({
    sourceId: p.id,
    title: p.text,
    locations: p.categories?.allLocations?.length ? p.categories.allLocations : [p.categories?.location].filter(Boolean),
    url: p.hostedUrl,
    postedAt: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    employment: p.categories?.commitment || null,
    workplace: p.workplaceType || null,
    text: [p.descriptionPlain, ...(p.lists || []).map((l) => `${l.text} ${plain(l.content)}`), p.additionalPlain].join(" "),
    pay: p.salaryRange ? money(p.salaryRange.min, p.salaryRange.max, p.salaryRange.interval) : null,
  }));
}

function money(min, max, interval = "") {
  const hourly = /hour/i.test(interval) || max < 500;
  const f = (n) => (hourly ? `$${Math.round(n)}` : `$${Math.round(n / 1000)}k`);
  return `${f(min)}${max && max !== min ? `–${f(max)}` : ""}${hourly ? "/hr" : ""}`;
}

// Ashby ----------------------------------------------------------------

async function ashby(c) {
  const j = await get(`https://api.ashbyhq.com/posting-api/job-board/${c.slug}?includeCompensation=true`);
  return j.jobs.filter((p) => p.isListed !== false).map((p) => ({
    sourceId: p.id,
    title: p.title.trim(),
    locations: [p.location, ...(p.secondaryLocations || []).map((l) => l.location)].filter(Boolean),
    url: p.jobUrl,
    postedAt: p.publishedAt || null,
    employment: p.employmentType || null,
    workplace: p.isRemote ? "Remote" : p.workplaceType || null,
    text: p.descriptionPlain || "",
    pay: p.compensation?.compensationTierSummary || p.compensation?.scrapeableCompensationSalarySummary || null,
  }));
}

// SmartRecruiters -------------------------------------------------------

async function smartrecruiters(c) {
  const out = [];
  for (let offset = 0; offset < 3000; offset += 100) {
    const j = await get(`https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100&offset=${offset}&country=us`);
    for (const p of j.content || []) {
      out.push({
        sourceId: p.id,
        title: p.name,
        locations: [p.location?.fullLocation || [p.location?.city, p.location?.region, p.location?.country].filter(Boolean).join(", ")],
        url: `https://jobs.smartrecruiters.com/${c.slug}/${p.id}`,
        postedAt: p.releasedDate || null,
        employment: [p.typeOfEmployment?.label, p.experienceLevel?.label].filter(Boolean).join(" "),
        workplace: p.location?.remote ? "Remote" : p.location?.hybrid ? "Hybrid" : null,
        text: "",
        pay: null,
      });
    }
    if (!j.content || j.content.length < 100) break;
  }
  return out;
}

// Workday ---------------------------------------------------------------
//
// No full listing: search is fuzzy and newest-first. So: (1) any facet value
// that means intern/student/early-career, paged to the end; (2) keyword
// passes for new-grad roles, stopping once results go 30+ days stale.

const EARLY_FACET = /\b(intern|internship|co-?op|student|universit|campus|early career|new grad|apprentice)/i;
const WD_QUERIES = ["intern", "new grad", "entry level", "early career", "university", "associate", "co-op", "junior"];

async function workday(c) {
  const base = `https://${c.tenant}.${c.host}.myworkdayjobs.com/wday/cxs/${c.tenant}/${c.site}`;
  const page = (body) => get(`${base}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: 20, offset: 0, searchText: "", appliedFacets: {}, ...body }) });
  const seen = new Map();
  const take = (list = []) => { for (const p of list) if (p.externalPath && !seen.has(p.externalPath)) seen.set(p.externalPath, p); };

  const first = await page({});
  const facets = {};
  for (const f of first.facets || []) {
    const vals = (f.values || []).flatMap((v) => (v.values ? v.values : [v]));
    const ids = vals.filter((v) => EARLY_FACET.test(v.descriptor) && !/non-?us/i.test(v.descriptor)).map((v) => v.id);
    if (ids.length) facets[f.facetParameter] = ids;
  }
  // Some tenants reject a facet or a deep offset with a 400; that ends that
  // pass, not the board.
  const pass = async (body, max, stop) => {
    for (let offset = 0; offset < max; offset += 20) {
      let j;
      try { j = await page({ ...body, offset }); } catch { return; }
      take(j.jobPostings);
      if (!j.jobPostings?.length || offset + 20 >= j.total || stop(j.jobPostings)) return;
    }
  };
  for (const [param, ids] of Object.entries(facets)) await pass({ appliedFacets: { [param]: ids } }, 600, () => false);
  for (const q of WD_QUERIES) await pass({ searchText: q }, 100, (ps) => ps.some((p) => /30\+/.test(p.postedOn || "")));

  const now = Date.now();
  return [...seen.values()].map((p) => {
    const m = /(\d+)\+? Days? Ago/i.exec(p.postedOn || "");
    const days = /today/i.test(p.postedOn) ? 0 : /yesterday/i.test(p.postedOn) ? 1 : m ? Number(m[1]) : null;
    return {
      sourceId: p.bulletFields?.[0] || p.externalPath,
      path: p.externalPath,
      title: p.title,
      locations: [p.locationsText].filter(Boolean),
      url: `https://${c.tenant}.${c.host}.myworkdayjobs.com/en-US/${c.site}${p.externalPath}`,
      // "Today" is an upper bound (run.mjs clamps it to first sighting);
      // "N days ago" means sometime that day, so take its middle.
      postedAt: days == null ? null : new Date(now - (days ? days + 0.5 : 0) * 864e5).toISOString(),
      postedApprox: true,
      employment: p.timeType || null,
      workplace: p.remoteType || null,
      text: "",
      pay: null,
    };
  });
}

// The listing gives one location line ("3 Locations") and no description.
// For postings we keep, the detail call fills in both.
workday.detail = async (c, r) => {
  const j = await get(`https://${c.tenant}.${c.host}.myworkdayjobs.com/wday/cxs/${c.tenant}/${c.site}${r.path}`);
  const i = j.jobPostingInfo || {};
  return { ...r, locations: [i.location, ...(i.additionalLocations || [])].filter(Boolean), text: plain(i.jobDescription || ""), workplace: i.remoteType || r.workplace };
};

// Amazon ----------------------------------------------------------------

const AMZN_QUERIES = ["intern", "new grad", "university graduate", "early career", "entry level"];

async function amazon() {
  const seen = new Map();
  for (const q of AMZN_QUERIES) {
    for (let offset = 0; offset < 500; offset += 100) {
      const j = await get(`https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}&country=USA&result_limit=100&offset=${offset}&sort=recent`);
      for (const p of j.jobs || []) seen.set(p.id_icims, p);
      if (!j.jobs || j.jobs.length < 100) break;
    }
  }
  return [...seen.values()].map((p) => ({
    sourceId: p.id_icims,
    title: p.title,
    locations: [p.normalized_location || p.location].filter(Boolean),
    url: `https://www.amazon.jobs${p.job_path}`,
    postedAt: p.posted_date ? new Date(`${p.posted_date} 12:00 UTC`).toISOString() : null,
    employment: p.job_schedule_type || null,
    workplace: null,
    text: plain([p.description, p.basic_qualifications, p.preferred_qualifications].join(" ")),
    pay: null,
  }));
}

export const fetchers = { gh: greenhouse, lv: lever, ab: ashby, sr: smartrecruiters, wd: workday, amzn: amazon };
