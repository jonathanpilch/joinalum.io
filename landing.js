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

const [data, P, LOGOS] = await Promise.all([
  fetch("data/jobs.json").then((r) => r.json()).catch(() => null),
  fetch("data/placements.json").then((r) => r.json()).catch(() => null),
  fetch("assets/logos/index.json").then((r) => r.json()).catch(() => ({})),
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
$("#proof").innerHTML = [P && `<b data-count="${P.placed}">${fmt(P.placed)}</b> Hokie first jobs tracked`, today && `<b data-count="${today}">${fmt(today)}</b> new internships today`, "free, no sign-up to browse"].filter(Boolean).join(" · ");
if (today) $("#final-sub").textContent = `${fmt(today)} new internships in the last 24 hours. See them before everyone else does.`;

// Hero shots -----------------------------------------------------------------------

$("#shot-tally").innerHTML = `<b>${fmt(JOBS.length)}</b> internships · ${fmt(today)} new today`;
const jobCard = (j, incoming = false) => {
  const h = hires(j.company);
  return `<article class="job${incoming ? " incoming" : ""}">
    ${incoming ? `<span class="just-in">New today</span>` : ""}
    <span class="save"><i data-lucide="heart"></i></span>
    <div class="job-top">${logo(j.company)}<div class="job-co"><b>${esc(j.company)}</b><span>${esc(j.location)} · <em class="new">${ago(Math.round((now - Date.parse(j.postedAt)) / 6e4))}</em></span></div></div>
    <h3>${esc(j.title)}</h3>
    ${h ? `<div class="job-foot"><span class="hokie"><b>${fmt(h.n)}</b> Hokies hired</span></div>` : ""}
  </article>`;
};
$("#shot-jobs").innerHTML = JOBS.slice(0, 4).map((j) => jobCard(j)).join("");

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
    <div class="stat" data-count="${h.n}">${fmt(h.n)}</div><p>Hokies hired, ${fmt(h.recent)} from the classes of ${span}</p>`;

  const [c2, h2] = ranked[1] || ranked[0];
  $("#employer").innerHTML = `<div class="l-emp-head">${logo(c2, "lg")}<div><b>${esc(c2)}</b><span>${esc(hokieLine(c2))}</span></div></div>
    <div class="pills">${Object.entries(h2.byMajor).slice(0, 5).map(([m, n]) => `<span class="pill">${esc(m)}<b>${n}</b></span>`).join("")}</div>
    <ul class="titles">${h2.titles.slice(0, 4).map(([t, n]) => `<li><span>${esc(t)}</span><b>${n}</b></li>`).join("")}</ul>
    <div class="l-radar"><span class="logo radar"><i data-lucide="radar"></i></span><div><b>Radar: ${esc(c2)} · Summer 2027</b><span>Emails you within the hour when one posts</span></div></div>`;

  // A slider of the employers' own wordmarks (scripts/logos.mjs), the list
  // twice in a row so sliding by half loops seamlessly. Marks are sized by
  // area, so a square mark and a long wordmark look equally big; a company
  // without a logo file gets its name set in type.
  const AREA = 13000; // px², about 200 × 66 for a 3:1 wordmark
  const mark = (name) => {
    const l = LOGOS[name];
    if (!l) return `<span class="l-logo"><b class="l-wordmark">${esc(name)}</b></span>`;
    const h = Math.round(Math.min(84, Math.max(34, Math.sqrt(AREA / (l.aspect || 3)))));
    return `<span class="l-logo"><img src="assets/logos/${esc(l.file)}" alt="${esc(name)}" style="--h:${h}" decoding="async" /></span>`;
  };
  const strip = ranked.slice(0, 16).map(([name]) => mark(name)).join("");
  $("#strip").innerHTML = `<div class="l-marquee-track">${strip}<span class="l-dup" aria-hidden="true">${strip}</span></div>`;

  const top = ranked.slice(0, 8);
  const max = top[0][1].recent;
  $("#employers-sub").textContent = `First jobs reported by Virginia Tech graduates from the classes of ${span}, at employers with internships on Alum right now.`;
  $("#bars").innerHTML = top.map(([name, h], i) => `<div class="l-bar">
      <span class="l-bar-name">${logo(name)}<b>${esc(name)}</b></span>
      <span class="l-bar-track"><span class="l-bar-fill" style="--w:${Math.max(4, (h.recent / max) * 100)}%;--d:${i * 60}ms"></span></span>
      <span class="l-bar-n" data-count="${h.recent}">${fmt(h.recent)}</span>
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
$("#sync").innerHTML = `<div class="l-sync-head"><b>Career sites</b><span>Updated ${ago(Math.round((now - Date.parse(data.generatedAt)) / 6e4))}</span></div>
  ${recent.map(([c, x]) => `<div class="l-sync-row">${logo(c)}<b>${esc(c)}</b><span>${x.n} internship${x.n === 1 ? "" : "s"}</span><i data-lucide="circle-check"></i></div>`).join("")}`;

icons();

// Motion ---------------------------------------------------------------------------
//
// Everything below is decoration. With "reduce motion" on, the page is shown
// finished: no counting, sliding, tilting or sweeping.

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Numbers count up from zero.
function countUp(el) {
  const to = Number(el.dataset.count);
  if (calm || !to) return;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 1400);
    el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  el.textContent = "0";
  requestAnimationFrame(step);
}

// When something scrolls in: fade it up, draw its underlines, run its numbers.
function arrive(el) {
  el.classList.add("in");
  (el.matches("u") ? [el] : el.querySelectorAll("u")).forEach((u) => u.classList.add("drawn"));
  el.querySelectorAll("[data-count]").forEach(countUp);
  if (el.id === "bars") el.classList.add("in");
  if (el.classList.contains("l-pain")) setTimeout(() => el.classList.add("settled"), 1100);
  if (el.querySelector("#sync")) sweep();
}
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  arrive(e.target);
  io.unobserve(e.target);
}), { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });

const targets = [
  ".l-strip > p", ".l-section .l-eyebrow", ".l-section h2", ".l-sub", ".l-pain", ".l-punch",
  ".l-step-text", ".l-step-shot", "#bars", ".l-faq details", ".l-final",
];
for (const sel of targets) {
  document.querySelectorAll(sel).forEach((el, i) => {
    // Siblings in a row arrive a beat apart.
    if (/l-pain|details/.test(sel)) el.style.setProperty("--rd", `${i * 90}ms`);
    if (sel === ".l-step-shot") el.style.setProperty("--rd", "120ms");
    // Already on screen at load: show it as is, no entrance.
    if (calm || el.getBoundingClientRect().top < innerHeight * 0.9) return arrive(el);
    el.classList.add("reveal");
    io.observe(el);
  });
}
document.querySelectorAll("#step-asks li").forEach((li, i) => li.style.setProperty("--rd", `${300 + i * 220}ms`));

// The hero's underline draws once the headline has risen.
setTimeout(() => document.querySelectorAll(".l-hero u").forEach((u) => u.classList.add("drawn")), calm ? 0 : 650);
document.querySelectorAll(".l-hero [data-count]").forEach(countUp);

if (!calm) {
  // Today's internships slide into the mock board, one every few seconds.
  // A replay, so only postings from the last 24 hours, and the badge says
  // "New today", not "just now".
  const queue = JOBS.slice(4).filter((j) => now - Date.parse(j.postedAt) < 864e5);
  const grid = $("#shot-jobs");
  let next = 0;
  setInterval(() => {
    if (document.hidden || !queue.length || grid.getBoundingClientRect().bottom < 0) return;
    grid.querySelectorAll(".just-in").forEach((b) => b.remove());
    grid.querySelectorAll(".incoming").forEach((c) => c.classList.remove("incoming"));
    grid.insertAdjacentHTML("afterbegin", jobCard(queue[next++ % queue.length], true));
    grid.lastElementChild.remove();
    icons();
  }, 4200);

  // The product window leans toward the cursor.
  if (matchMedia("(pointer: fine)").matches) {
    const hero = $(".l-hero"), shots = $(".l-shots");
    hero.addEventListener("mousemove", (e) => {
      const r = shots.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 1.2)));
      const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 1.2)));
      shots.style.setProperty("--ry", (x * 5).toFixed(2));
      shots.style.setProperty("--rx", (-y * 4).toFixed(2));
    });
    hero.addEventListener("mouseleave", () => { shots.style.setProperty("--rx", 0); shots.style.setProperty("--ry", 0); });
  }
}

// Step 1: a sweep down the career sites, checking each in turn, while the
// card is on screen.
let sweeping = false;
async function sweep() {
  if (calm || sweeping) return;
  sweeping = true;
  const card = $("#sync");
  const visible = () => { const r = card.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && !document.hidden; };
  while (true) {
    if (!visible()) { await wait(800); continue; }
    for (const row of card.querySelectorAll(".l-sync-row")) {
      row.classList.add("checking");
      await wait(650);
      row.classList.remove("checking");
      row.classList.add("done");
      setTimeout(() => row.classList.remove("done"), 500);
      await wait(150);
    }
    await wait(3500);
  }
}
