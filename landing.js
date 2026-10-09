/* The landing page's numbers and product shots, from the same data the board
 * uses (data/jobs.json, data/placements.json) and the same fit logic
 * (lib/core.js). Everything here is today's real data; when a file can't be
 * loaded, the page keeps its plain-text fallbacks. */

import * as core from "./lib/core.js";

const $ = (s) => document.querySelector(s);
const esc = core.esc;
const fmt = (n) => n.toLocaleString("en-US");
const icons = () => window.lucide?.createIcons();
const short = (m) => (m.split(/\s+/).length > 1 ? m.split(/\s+/).filter((w) => !/^(and|of|&)$/i.test(w)).map((w) => w[0]).join("").toUpperCase() : m);
const ago = (m) => (m < 60 ? (m < 2 ? "just now" : `${m}m ago`) : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`);

// A sample student for the "who can apply" shots.
const SAMPLE = { ...core.PROFILE, year: "2028", degree: "Bachelor's", work: "citizen", skills: ["C++", "Python"], term: "Summer 2027", major: "Computer Science" };

// Returning students go straight to their board from the header.
try {
  if (localStorage.getItem("alum.saved") || localStorage.getItem("alum.profile")) $("#nav-cta").textContent = "Open your board";
} catch {}

const [data, P] = await Promise.all([
  fetch("data/jobs.json").then((r) => r.json()).catch(() => null),
  fetch("data/placements.json").then((r) => r.json()).catch(() => null),
]);
icons();
if (!data) throw new Error("landing: no jobs data");

const now = Date.now();
const JOBS = data.jobs.filter((j) => core.LEVELS.includes(j.level)).sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
const today = JOBS.filter((j) => now - Date.parse(j.postedAt) < 864e5).length;
const domains = new Map(JOBS.map((j) => [j.company, j.domain]));
const hires = (company) => (P && P.employers[P.boardIndex?.[company]]) || null;
const span = P ? `${P.recentCohorts[0].slice(0, 4)}–${P.recentCohorts.at(-1).slice(5)}` : "";

const initials = (name) => name.split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || name[0];
const logo = (company, cls = "") => {
  const d = domains.get(company);
  return `<span class="logo ${cls}">${esc(initials(company))}${d ? `<img src="https://www.google.com/s2/favicons?domain=${esc(d)}&sz=128" alt="" loading="lazy" onload="this.naturalWidth>16?this.parentNode.classList.add('has-img'):this.remove()" onerror="this.remove()" />` : ""}</span>`;
};
const hokieLine = (company) => {
  const h = hires(company);
  if (!h) return "";
  const top = Object.keys(h.byMajor).slice(0, 2).map(short);
  return `${fmt(h.n)} Hokies hired${top.length ? ` · mostly ${top.join(", ")}` : ""}`;
};

// Counts -------------------------------------------------------------------------

const companies = data.companies || new Set(data.jobs.map((j) => j.company)).size;
$("#n-companies").textContent = `${fmt(companies)} employers`;
if (P) $("#n-placed").textContent = `${fmt(P.placed)}`;
if (P?.sourceUrl) $("#source").href = P.sourceUrl;
document.querySelectorAll("[data-count-cta]").forEach((a) => (a.firstChild.textContent = `Browse ${fmt(JOBS.length)} internships`));
$("#proof").innerHTML = [P && `<b>${fmt(P.placed)}</b> Hokie first jobs tracked`, today && `<b>${fmt(today)}</b> new internships today`, "free, no sign-up to browse"].filter(Boolean).join(" · ");
if (today) $("#final-sub").textContent = `${fmt(today)} new internships in the last 24 hours. See them before everyone else does.`;

// Hero shots -----------------------------------------------------------------------

$("#shot-tally").innerHTML = `<b>${fmt(JOBS.length)}</b> internships · ${fmt(today)} new today`;
$("#shot-jobs").innerHTML = JOBS.slice(0, 4).map((j) => {
  const h = hokieLine(j.company);
  return `<article class="job">
    <span class="save"><i data-lucide="heart"></i></span>
    <div class="job-top">${logo(j.company)}<div class="job-co"><b>${esc(j.company)}</b><span>${esc(j.level === "Co-op" ? "Co-op" : j.term || "Internship")}</span></div></div>
    <h3>${esc(j.title)}</h3>
    <div class="job-meta"><span><i data-lucide="map-pin"></i>${esc(j.location)}</span><span class="new"><i data-lucide="clock"></i>${ago(Math.round((now - Date.parse(j.postedAt)) / 6e4))}</span></div>
    ${h ? `<div class="job-foot"><span class="hokie"><i data-lucide="users"></i>${esc(h)}</span></div>` : ""}
  </article>`;
}).join("");

// "Who can apply", for a real posting with rules in it (or a stand-in until
// the data carries them).
const MARK = { ok: "circle-check", warn: "circle-alert", no: "circle-x" };
const asksHtml = (rows) => rows.map((r) => `<li class="${r.state || ""}"><i data-lucide="${(r.state && MARK[r.state]) || r.icon}"></i><span>${r.html ? r.text : esc(r.text)}</span></li>`).join("");
const ruled = JOBS.filter((j) => j.elig && (j.elig.grad || j.elig.clearance) && core.asks(j, SAMPLE).length >= 3);
const sampleRows = (j) => core.asks(j, SAMPLE).slice(0, 4);
const FALLBACK = [
  { icon: "graduation-cap", text: "Graduating Dec '27–Jun '28", state: "ok" },
  { icon: "calendar", text: "Summer 2027, when you want", state: "ok" },
  { icon: "shield-check", text: "Must be able to get a Secret clearance (US citizens)", state: "ok" },
  { icon: "wrench", text: "Tools: <b>C++</b>, <b>Python</b>, MATLAB", state: "ok", html: true },
];
$("#shot-asks").innerHTML = asksHtml(ruled[0] ? sampleRows(ruled[0]) : FALLBACK);
$("#step-asks").innerHTML = asksHtml(ruled[1] ? sampleRows(ruled[1]) : FALLBACK.slice(0, 3));
const out = JOBS.filter((j) => core.blocked(j, SAMPLE)).length;
$("#n-filtered").textContent = out ? `${fmt(out)} roles this student can't apply to` : "Roles you can't apply to";

// Employers ----------------------------------------------------------------------

const onBoard = [...new Set(JOBS.map((j) => j.company))];
const ranked = onBoard.map((c) => [c, hires(c)]).filter(([, h]) => h).sort((a, b) => b[1].recent - a[1].recent);

if (ranked.length) {
  const [c, h] = ranked[0];
  $("#shot-hokies").innerHTML = `<div class="l-emp-head">${logo(c)}<div><b>${esc(c)}</b><span>${fmt(JOBS.filter((j) => j.company === c).length)} open internships</span></div></div>
    <div class="stat">${fmt(h.n)}</div><p>Hokies hired, ${fmt(h.recent)} from the classes of ${span}</p>`;

  const [c2, h2] = ranked[1] || ranked[0];
  $("#employer").innerHTML = `<div class="l-emp-head">${logo(c2, "lg")}<div><b>${esc(c2)}</b><span>${esc(hokieLine(c2))}</span></div></div>
    <div class="pills">${Object.entries(h2.byMajor).slice(0, 5).map(([m, n]) => `<span class="pill">${esc(m)}<b>${n}</b></span>`).join("")}</div>
    <ul class="titles">${h2.titles.slice(0, 4).map(([t, n]) => `<li><span>${esc(t)}</span><b>${n}</b></li>`).join("")}</ul>
    <div class="l-radar"><span class="logo radar"><i data-lucide="radar"></i></span><div><b>Radar: ${esc(c2)} · Summer 2027</b><span>Emails you within the hour when one posts</span></div></div>`;

  // A slider: the list twice in a row, so sliding by half loops seamlessly.
  const strip = ranked.slice(0, 16).map(([name]) => `<span class="l-logo">${logo(name, "xl")}<b>${esc(name)}</b></span>`).join("");
  $("#strip").innerHTML = `<div class="l-marquee-track">${strip}<span class="l-dup" aria-hidden="true">${strip}</span></div>`;

  const top = ranked.slice(0, 8);
  const max = top[0][1].recent;
  $("#employers-sub").textContent = `First jobs reported by Virginia Tech graduates from the classes of ${span}, at employers with internships on Alum right now.`;
  $("#bars").innerHTML = top.map(([name, h], i) => `<div class="l-bar">
      <span class="l-bar-name">${logo(name)}<b>${esc(name)}</b></span>
      <span class="l-bar-track"><span class="l-bar-fill" style="--w:${Math.max(4, (h.recent / max) * 100)}%;--d:${i * 60}ms"></span></span>
      <span class="l-bar-n">${fmt(h.recent)}</span>
    </div>`).join("") + `<p class="fine-inline">Hokies hired, classes of ${span}. Source: VT's First Destination Report (self-reported).</p>`;
}

// Step 1: the hourly pull, as it looks right now -----------------------------------------

// Companies with the newest internships, and how many each has open.
const latest = new Map();
for (const j of JOBS) {
  const x = latest.get(j.company) || { t: 0, n: 0 };
  x.t = Math.max(x.t, Date.parse(j.firstSeenAt));
  x.n++;
  latest.set(j.company, x);
}
const recent = [...latest.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 6);
const trackedSince = Math.min(...data.jobs.map((j) => Date.parse(j.firstSeenAt))) + 36e5;
const lags = data.jobs
  .filter((j) => !j.postedApprox && j.postedAt !== j.firstSeenAt && Date.parse(j.postedAt) > trackedSince && now - Date.parse(j.postedAt) < 14 * 864e5)
  .map((j) => (Date.parse(j.firstSeenAt) - Date.parse(j.postedAt)) / 6e4).filter((m) => m >= 0).sort((a, b) => a - b);
const median = lags.length >= 10 ? Math.round(lags[Math.floor(lags.length / 2)]) : null;
$("#sync").innerHTML = `<div class="l-sync-head"><b>Career sites</b><span>Updated ${ago(Math.round((now - Date.parse(data.generatedAt)) / 6e4))}</span></div>
  ${recent.map(([c, x]) => `<div class="l-sync-row">${logo(c)}<b>${esc(c)}</b><span>${x.n} internship${x.n === 1 ? "" : "s"}</span><i data-lucide="circle-check"></i></div>`).join("")}
  ${median != null ? `<p class="fine-inline">Median time from a company posting to Alum, last 14 days: <b>${median < 60 ? `${median} min` : `${(median / 60).toFixed(1)} h`}</b></p>` : ""}`;

icons();

// Bars grow in when they scroll into view.
const bars = $("#bars");
new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { bars.classList.add("in"); o.disconnect(); } }), { threshold: 0.3 }).observe(bars);
