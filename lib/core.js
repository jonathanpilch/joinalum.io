/* What decides which internships a student sees, shared by the page (app.js)
 * and the radar emails (ingest/notify.mjs), so an alert never shows a role
 * the board would have hidden. Pure functions, no DOM.
 *
 * A profile is { name, major, year, term, degree, work, gpa, skills,
 * interests, places }; `year` is the May they graduate. A search is
 * { q, cat, filters } with filters as built by blankFilters(). */

export const LEVELS = ["Internship", "Co-op"]; // v1: internships only (co-ops count)
export const PIPELINE = 5; // recent hires that make a "proven" Hokie employer
export const DEGREES = ["Bachelor's", "Master's", "PhD"];
export const WORK = { citizen: "US citizen", cleared: "US citizen, holds a clearance", pr: "Permanent resident", visa: "Need visa sponsorship" };
export const PROFILE = { name: "", major: "", year: "", term: "Summer 2027", degree: "Bachelor's", work: "", gpa: "", skills: [], interests: [], places: [] };

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const PLACES = {
  "DC area": (j) => j.states.some((s) => ["DC", "MD", "VA"].includes(s)),
  Richmond: (j) => /richmond|glen allen|henrico|midlothian/i.test(j.location),
  "New York": (j) => j.states.includes("NY"),
  Remote: (j) => /remote/i.test(j.arrangement),
};

// Placements ------------------------------------------------------------------

export const hiresOf = (P, j) => (P && P.employers[P.boardIndex?.[j.company]]) || null;
// Hires from the student's major when they've said it, else everyone.
export function majorHiresN(P, j, profile) {
  const h = hiresOf(P, j);
  if (!h) return 0;
  return (profile.major && h.byMajor[profile.major]) || (profile.major ? 0 : h.n);
}

// Dates -----------------------------------------------------------------------

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mon = (ym) => `${MON[Number(ym.slice(5)) - 1]} '${ym.slice(2, 4)}`;
export function gradSpan([from, to]) {
  if (from && to && from.slice(0, 4) === to.slice(0, 4) && from.endsWith("-01") && to.endsWith("-12")) return `class of ${from.slice(0, 4)}`;
  if (!from) return `by ${mon(to)}`;
  return from === to ? mon(from) : `${mon(from)}–${mon(to)}`;
}
// "Summer 2027" -> when it starts and ends, roughly.
const SEASON = { Winter: ["01", "03"], Spring: ["01", "05"], Summer: ["05", "08"], Fall: ["08", "12"] };
export function termSpan(t) {
  const m = /^(\w+) (20\d\d)$/.exec(t || "");
  return m && SEASON[m[1]] ? [`${m[2]}-${SEASON[m[1]][0]}`, `${m[2]}-${SEASON[m[1]][1]}`] : null;
}

// Fit -------------------------------------------------------------------------

export const knowsFit = (p) => !!(p.year || p.work || p.gpa || p.skills?.length);

/* What a posting asks for, one row each, marked against the profile:
 * "ok", "warn" (a gap you can live with), "no" (rules you out), or null
 * (the profile doesn't say). `tag` is the two-word version a card shows when
 * the row rules you out; `html` rows are already escaped. */
export function asks(j, p) {
  const e = j.elig || {};
  const g = p.year ? `${p.year}-05` : null; // a May graduation
  const citizen = p.work === "citizen" || p.work === "cleared";
  const skills = p.skills || [];
  const rows = [];
  const row = (icon, text, state = null, tag = text) => rows.push({ icon, text, state, tag });

  if (e.grad) {
    const [from, to] = e.grad;
    const inside = g && !((from && g < from) || (to && g > to));
    row("graduation-cap", `Graduating ${gradSpan(e.grad)}${g && !inside ? ` · you're May '${String(p.year).slice(2)}` : ""}`, g ? (inside ? "ok" : "no") : null, `Grads ${gradSpan(e.grad)}`);
  }
  const span = termSpan(j.term);
  if (e.returning) row("rotate-ccw", "Must return to school afterward", g && span ? (g <= span[1] ? "no" : "ok") : null, "Must return to school");
  if (span && p.term && p.term !== "Any time") row("calendar", j.term === p.term ? `${j.term}, when you want` : `${j.term} · you want ${p.term}`, j.term === p.term ? "ok" : "warn");
  else if (span && g && !e.grad && !e.returning && span[0] > g) row("calendar", `${j.term} · starts after you graduate`, "warn");

  if (e.degree) {
    const need = e.degree === "PhD" ? 2 : 1;
    row("school", e.degree === "PhD" ? "PhD students only" : "Grad students only (Master's, MBA, PhD)", p.degree ? (DEGREES.indexOf(p.degree) >= need ? "ok" : "no") : null, e.degree === "PhD" ? "PhD only" : "Grad students only");
  }
  if (e.clearance) {
    const lvl = e.clearanceLevel ? `${e.clearanceLevel} ` : "";
    const active = e.clearance === "active";
    const state = !p.work ? null : !citizen ? "no" : active && p.work !== "cleared" ? "warn" : "ok";
    row("shield-check", active ? `Active ${lvl}clearance required` : `Must be able to get a ${lvl || "security "}clearance (US citizens)`, state, "US citizens only");
  } else if (e.citizen) row("flag", "US citizens only", p.work ? (citizen ? "ok" : "no") : null);
  if (e.noSponsor) row("stamp", "No visa sponsorship", p.work ? (p.work === "visa" ? "no" : "ok") : null, "No sponsorship");
  if (e.gpa) row("award", `GPA ${e.gpa.toFixed(1)}+`, p.gpa ? (Number(p.gpa) >= e.gpa ? "ok" : "no") : null);
  if (j.skills?.length) {
    const have = j.skills.filter((s) => skills.includes(s));
    row("wrench", "Tools: " + j.skills.map((s) => (have.includes(s) ? `<b>${esc(s)}</b>` : esc(s))).join(", "), skills.length ? (have.length ? "ok" : "warn") : null);
    rows.at(-1).html = true;
  }
  return rows;
}

export const blocked = (j, p) => asks(j, p).find((r) => r.state === "no") || null;

// For the "Best fit" sort: dealbreakers sink, then what lines up, then
// where Hokies from your major already landed.
export function fitScore(j, p, P) {
  const rows = asks(j, p);
  if (rows.some((r) => r.state === "no")) return -1e6;
  const have = (j.skills || []).filter((s) => (p.skills || []).includes(s)).length;
  return rows.filter((r) => r.state === "ok").length * 2 - rows.filter((r) => r.state === "warn").length * 2 + have * 2 + Math.min(6, Math.log2(1 + majorHiresN(P, j, p)));
}

// Skills gap ------------------------------------------------------------------

/* The tools the student's internships ask for, against the ones they know.
 * The pool is postings that name tools, scoped by forYou() and minus any that
 * rule them out; under 20 and it widens to every posting. `have` is the
 * average share of a posting's tools they know; `next` is the missing tools
 * that raise it most, picked one at a time, each with the share it reaches. */
export function gap(jobs, p, { top = 10, picks = 3 } = {}) {
  const tooled = jobs.filter((j) => j.skills?.length && !blocked(j, p));
  const mine = tooled.filter((j) => forYou(j, p));
  const scoped = mine.length >= 20;
  const pool = scoped ? mine : tooled;
  const cover = (set) => pool.reduce((a, j) => a + j.skills.filter((s) => set.has(s)).length / j.skills.length, 0) / (pool.length || 1);
  const counts = new Map();
  for (const j of pool) for (const s of j.skills) counts.set(s, (counts.get(s) || 0) + 1);
  const known = new Set(p.skills || []);
  const next = [];
  const set = new Set(known);
  for (let i = 0; i < picks; i++) {
    let best = null;
    for (const s of counts.keys()) {
      if (set.has(s)) continue;
      const share = cover(new Set([...set, s]));
      if (!best || share > best.share) best = { skill: s, share };
    }
    if (!best) break;
    set.add(best.skill);
    next.push(best);
  }
  const demand = [...counts].sort((a, b) => b[1] - a[1]).slice(0, top).map(([skill, n]) => ({ skill, n, share: n / pool.length, have: known.has(skill) }));
  return { pool: pool.length, scoped, have: cover(known), next, demand };
}

// Searching -------------------------------------------------------------------

export const blankFilters = () => ({ posted: "all", levels: new Set(), places: new Set(), clearance: new Set(), pipeline: false, pay: false, eligible: true });

// Sets don't survive JSON: radars store arrays.
export const filtersToJSON = (f) => ({ ...f, levels: [...f.levels], places: [...f.places], clearance: [...f.clearance] });
export const filtersFromJSON = (f = {}) => ({ ...blankFilters(), ...f, levels: new Set(f.levels || []), places: new Set(f.places || []), clearance: new Set(f.clearance || []) });

export function forYou(j, p) {
  if (p.interests?.length && !p.interests.includes(j.fn)) return false;
  const places = (p.places || []).filter((x) => x !== "Anywhere");
  return !places.length || places.some((x) => PLACES[x]?.(j));
}

/* Does a posting belong in this search? `ctx` is { profile, P, now }. */
export function matches(j, { q = "", cat = "all", filters: f = blankFilters() }, { profile: p, P, now = Date.now() }) {
  if (cat === "for-you" && !forYou(j, p)) return false;
  if (cat !== "all" && cat !== "for-you" && j.fn !== cat) return false;
  if (f.eligible && knowsFit(p) && blocked(j, p)) return false;
  if (f.clearance.size && !f.clearance.has(j.elig?.clearance || "none")) return false;
  if (f.posted !== "all" && now - Date.parse(j.postedAt) > Number(f.posted) * 864e5) return false;
  if (f.levels.size && !f.levels.has(j.level)) return false;
  if (f.places.size && ![...f.places].some((x) => PLACES[x]?.(j))) return false;
  if (f.pipeline && (hiresOf(P, j)?.recent || 0) < PIPELINE) return false;
  if (f.pay && !j.pay) return false;
  if (q) {
    const hay = `${j.title} ${j.company} ${j.location} ${j.fn} ${j.term || ""}`.toLowerCase();
    if (!q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

// "Software · DC area · last 24 hours" -- a radar's default name.
export function describe({ q = "", cat = "all", filters: f = blankFilters() }) {
  const bits = [];
  if (q) bits.push(`“${q}”`);
  if (cat === "for-you") bits.push("For you");
  else if (cat !== "all") bits.push(cat);
  bits.push(...f.levels, ...f.places);
  if (f.clearance.size) bits.push([...f.clearance].map((c) => ({ none: "no clearance", obtain: "clearance once hired", active: "active clearance" })[c]).join(" or "));
  if (f.pipeline) bits.push("proven Hokie employers");
  if (f.pay) bits.push("shows pay");
  return bits.join(" · ") || "All internships";
}
