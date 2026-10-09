/* Alum -- two views behind one sliding switch: Internships and Profile.
 *
 * Internships come from data/jobs.json (written hourly by ingest/run.mjs);
 * "Hokies hired" comes from data/placements.json (VT's First Destination
 * Report). The profile and saved internships live in localStorage until
 * sign-in exists. Icons are Lucide: render HTML with <i data-lucide>, then
 * call icons().
 *
 * Fit is explained, never a bare percentage: each thing a posting asks for
 * (graduation window, degree, citizenship, clearance, sponsorship, GPA,
 * tools) becomes a row that the profile marks ok, a gap, or a dealbreaker. */
(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const school = SCHOOLS[new URLSearchParams(location.search).get("school")] || SCHOOLS.vt;
  const PAGE = 24;
  const LEVELS = ["Internship", "Co-op"]; // v1: internships only (co-ops count)
  const PIPELINE = 5; // recent hires that make a "proven" Hokie employer

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fmt = (n) => n.toLocaleString("en-US");
  const icons = () => window.lucide?.createIcons();
  const store = {
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // Icons per category; anything missing falls back to a briefcase.
  const FN_ICON = {
    Software: "code", Hardware: "cpu", "AI / ML": "brain-circuit", Data: "database", Security: "shield",
    "Cloud / IT": "cloud", Product: "layout-dashboard", Design: "pen-tool", Engineering: "cog",
    Research: "flask-conical", Quant: "trending-up", "Tech Consulting": "presentation",
    "Audit & Assurance": "clipboard-check", Tax: "receipt", Accounting: "calculator", Finance: "landmark",
    Consulting: "briefcase", "Supply Chain & Ops": "truck",
  };
  const PLACES = {
    "DC area": (j) => j.states.some((s) => ["DC", "MD", "VA"].includes(s)),
    Richmond: (j) => /richmond|glen allen|henrico|midlothian/i.test(j.location),
    "New York": (j) => j.states.includes("NY"),
    Remote: (j) => /remote/i.test(j.arrangement),
  };

  // Data ------------------------------------------------------------------

  let data;
  try {
    data = await fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json());
  } catch {
    $("#grid").innerHTML = '<p class="empty">No data yet. Run <code>npm run ingest</code>.</p>';
    return;
  }
  const P = await fetch("data/placements.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => null);
  const now = Date.now();
  const minutes = (iso) => Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  const JOBS = data.jobs.filter((j) => LEVELS.includes(j.level)).map((j) => ({ ...j, minutesAgo: minutes(j.postedAt) }));
  const byId = new Map(JOBS.map((j) => [j.id, j]));

  // Freshness we can prove: how long after the employer posted did Alum have
  // it? Only postings with an exact board time, posted after we started
  // keeping our own clock (state.json), count.
  const trackedSince = Math.min(...data.jobs.map((j) => Date.parse(j.firstSeenAt))) + 36e5;
  const exact = (j) => !j.postedApprox && j.postedAt !== j.firstSeenAt && Date.parse(j.postedAt) > trackedSince;
  const lagMin = (j) => (exact(j) ? Math.round((Date.parse(j.firstSeenAt) - Date.parse(j.postedAt)) / 60000) : null);
  const medianLag = (() => {
    const xs = data.jobs.filter((j) => now - Date.parse(j.postedAt) < 14 * 864e5).map(lagMin).filter((m) => m != null && m >= 0).sort((a, b) => a - b);
    return xs.length >= 10 ? xs[Math.floor(xs.length / 2)] : null;
  })();
  const hires = (j) => (P && P.employers[P.boardIndex?.[j.company]]) || null;
  const since = P ? P.cohorts[0].slice(5) : "";
  const recentSpan = P ? `${P.recentCohorts[0].slice(5)}–${P.recentCohorts.at(-1).slice(5)}` : "";

  // "Computer Science" -> "CS", "Finance" -> "Finance"
  const short = (m) => (m.split(/\s+/).length > 1 ? m.split(/\s+/).filter((w) => !/^(and|of|&)$/i.test(w)).map((w) => w[0]).join("").toUpperCase() : m);

  // Profile + saved ---------------------------------------------------------

  const PROFILE = { name: "", major: "", year: "", term: "Summer 2027", degree: "Bachelor's", work: "", gpa: "", skills: [], interests: [], places: [] };
  let profile = { ...PROFILE, ...store.get("alum.profile", {}) };
  let saved = store.get("alum.saved", {}); // id -> { status, at, job: {snapshot} }
  const saveProfile = () => { store.set("alum.profile", profile); flash($("#saved-note"), "Saved"); };
  const saveSaved = () => { store.set("alum.saved", saved); renderSavedCount(); };
  const hasPrefs = () => profile.interests.length || profile.places.filter((p) => p !== "Anywhere").length;

  function majorHires(j) {
    const h = hires(j);
    if (!h) return null;
    const mine = profile.major && h.byMajor[profile.major];
    return mine ? { n: mine, label: `${fmt(mine)} ${short(profile.major)} Hokies hired` } : { n: h.n, label: `${fmt(h.n)} Hokies hired` };
  }

  // Fit ---------------------------------------------------------------------

  const DEGREES = ["Bachelor's", "Master's", "PhD"];
  const WORK = { citizen: "US citizen", cleared: "US citizen, holds a clearance", pr: "Permanent resident", visa: "Need visa sponsorship" };
  const citizen = () => profile.work === "citizen" || profile.work === "cleared";
  const gradYM = () => (profile.year ? `${profile.year}-05` : null); // a May graduation
  const knowsFit = () => !!(profile.year || profile.work || profile.gpa || profile.skills.length);

  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = (ym) => `${MON[Number(ym.slice(5)) - 1]} '${ym.slice(2, 4)}`;
  function gradSpan([from, to]) {
    if (from && to && from.slice(0, 4) === to.slice(0, 4) && from.endsWith("-01") && to.endsWith("-12")) return `class of ${from.slice(0, 4)}`;
    if (!from) return `by ${mon(to)}`;
    return from === to ? mon(from) : `${mon(from)}–${mon(to)}`;
  }
  // "Summer 2027" -> when it starts and ends, roughly.
  const SEASON = { Winter: ["01", "03"], Spring: ["01", "05"], Summer: ["05", "08"], Fall: ["08", "12"] };
  function termSpan(t) {
    const m = /^(\w+) (20\d\d)$/.exec(t || "");
    return m && SEASON[m[1]] ? [`${m[2]}-${SEASON[m[1]][0]}`, `${m[2]}-${SEASON[m[1]][1]}`] : null;
  }

  /* What a posting asks for, one row each, marked against the profile:
   * "ok", "warn" (a gap you can live with), "no" (rules you out), or null
   * (the profile doesn't say). */
  function asks(j) {
    const e = j.elig || {};
    const g = gradYM();
    const rows = [];
    // `tag` is the two-word version a card shows when this row rules you out.
    const row = (icon, text, state = null, tag = text) => rows.push({ icon, text, state, tag });

    if (e.grad) {
      const [from, to] = e.grad;
      const inside = g && !((from && g < from) || (to && g > to));
      row("graduation-cap", `Graduating ${gradSpan(e.grad)}${g && !inside ? ` · you're May '${String(profile.year).slice(2)}` : ""}`, g ? (inside ? "ok" : "no") : null, `Grads ${gradSpan(e.grad)}`);
    }
    const span = termSpan(j.term);
    if (e.returning) row("rotate-ccw", "Must return to school afterward", g && span ? (g <= span[1] ? "no" : "ok") : null, "Must return to school");
    if (span && profile.term && profile.term !== "Any time") row("calendar", j.term === profile.term ? `${j.term}, when you want` : `${j.term} · you want ${profile.term}`, j.term === profile.term ? "ok" : "warn");
    else if (span && g && !e.grad && !e.returning && span[0] > g) row("calendar", `${j.term} · starts after you graduate`, "warn");

    if (e.degree) {
      const need = e.degree === "PhD" ? 2 : 1;
      row("school", e.degree === "PhD" ? "PhD students only" : "Grad students only (Master's, MBA, PhD)", profile.degree ? (DEGREES.indexOf(profile.degree) >= need ? "ok" : "no") : null, e.degree === "PhD" ? "PhD only" : "Grad students only");
    }
    if (e.clearance) {
      const lvl = e.clearanceLevel ? `${e.clearanceLevel} ` : "";
      const active = e.clearance === "active";
      const state = !profile.work ? null : !citizen() ? "no" : active && profile.work !== "cleared" ? "warn" : "ok";
      row("shield-check", active ? `Active ${lvl}clearance required` : `Must be able to get a ${lvl || "security "}clearance (US citizens)`, state, "US citizens only");
    } else if (e.citizen) row("flag", "US citizens only", profile.work ? (citizen() ? "ok" : "no") : null);
    if (e.noSponsor) row("stamp", "No visa sponsorship", profile.work ? (profile.work === "visa" ? "no" : "ok") : null, "No sponsorship");
    if (e.gpa) row("award", `GPA ${e.gpa.toFixed(1)}+`, profile.gpa ? (Number(profile.gpa) >= e.gpa ? "ok" : "no") : null);
    if (j.skills?.length) {
      const have = j.skills.filter((s) => profile.skills.includes(s));
      row("wrench", "Tools: " + j.skills.map((s) => (have.includes(s) ? `<b>${esc(s)}</b>` : esc(s))).join(", "), profile.skills.length ? (have.length ? "ok" : "warn") : null);
      rows.at(-1).html = true;
    }
    return rows;
  }

  const blocked = (j) => asks(j).find((r) => r.state === "no") || null;

  // For the "Best fit" sort: dealbreakers sink, then what lines up, then
  // where Hokies from your major already landed.
  function fitScore(j) {
    const rows = asks(j);
    if (rows.some((r) => r.state === "no")) return -1e6;
    const have = (j.skills || []).filter((s) => profile.skills.includes(s)).length;
    const h = majorHires(j)?.n || 0;
    return rows.filter((r) => r.state === "ok").length * 2 - rows.filter((r) => r.state === "warn").length * 2 + have * 2 + Math.min(6, Math.log2(1 + h));
  }

  // Internships: state, filtering ----------------------------------------------

  const blank = () => ({ posted: "all", levels: new Set(), places: new Set(), clearance: new Set(), pipeline: false, pay: false, eligible: true });
  let filters = blank();
  let cat = hasPrefs() ? "for-you" : "all";
  let sort = "new";
  let q = "";
  let shown = PAGE;

  function forYou(j) {
    if (profile.interests.length && !profile.interests.includes(j.fn)) return false;
    const places = profile.places.filter((p) => p !== "Anywhere");
    return !places.length || places.some((p) => PLACES[p]?.(j));
  }

  const clearanceOf = (j) => j.elig?.clearance || "none";

  function matches(j, f = filters, c = cat) {
    if (c === "for-you" && !forYou(j)) return false;
    if (f.eligible && blocked(j)) return false;
    if (f.clearance.size && !f.clearance.has(clearanceOf(j))) return false;
    if (c !== "all" && c !== "for-you" && j.fn !== c) return false;
    if (f.posted !== "all" && j.minutesAgo > Number(f.posted) * 1440) return false;
    if (f.levels.size && !f.levels.has(j.level)) return false;
    if (f.places.size && ![...f.places].some((p) => PLACES[p]?.(j))) return false;
    if (f.pipeline && (hires(j)?.recent || 0) < PIPELINE) return false;
    if (f.pay && !j.pay) return false;
    if (q) {
      const hay = `${j.title} ${j.company} ${j.location} ${j.fn} ${j.term || ""}`.toLowerCase();
      if (!q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  const activeFilters = () => (filters.posted !== "all") + filters.levels.size + filters.places.size + filters.clearance.size + filters.pipeline + filters.pay + !filters.eligible;

  function list() {
    const xs = JOBS.filter((j) => matches(j));
    if (sort === "fit") xs.sort((a, b) => fitScore(b) - fitScore(a) || a.minutesAgo - b.minutesAgo);
    else if (sort === "hokies") xs.sort((a, b) => (majorHires(b)?.n || 0) - (majorHires(a)?.n || 0) || a.minutesAgo - b.minutesAgo);
    else xs.sort((a, b) => a.minutesAgo - b.minutesAgo);
    return xs;
  }

  // Rendering ----------------------------------------------------------------

  function ago(m) {
    if (m < 60) return m < 2 ? "Just now" : `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    const d = Math.floor(m / 1440);
    return d === 1 ? "Yesterday" : d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
  }
  // Workday only says "Posted Today": don't fake minutes.
  const when = (j) => (j.postedApprox && j.minutesAgo >= 60 && j.minutesAgo < 1440 ? "Today" : ago(j.minutesAgo));

  const initials = (name) => name.split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || name[0];
  const logo = (j, cls = "") =>
    `<span class="logo ${cls}">${esc(initials(j.company))}${j.domain ? `<img src="https://www.google.com/s2/favicons?domain=${esc(j.domain)}&sz=128" alt="" loading="lazy" onload="this.naturalWidth>16?this.parentNode.classList.add('has-img'):this.remove()" onerror="this.remove()" />` : ""}</span>`;
  const heart = (id) => `<button class="save ${saved[id] ? "on" : ""}" data-save="${esc(id)}" aria-label="${saved[id] ? "Unsave" : "Save"}"><i data-lucide="heart"></i></button>`;

  // The Hokie signal: how many VT grads this employer hired, and from where.
  function hokieLine(j) {
    const h = hires(j);
    if (!h) return null;
    const mine = profile.major && h.byMajor[profile.major];
    if (mine) return `${fmt(h.n)} Hokies hired · ${fmt(mine)} ${short(profile.major)}`;
    const top = Object.keys(h.byMajor).slice(0, 2).map(short);
    return `${fmt(h.n)} Hokies hired${top.length ? ` · mostly ${top.join(", ")}` : ""}`;
  }

  function tags(j) {
    const e = j.elig || {};
    const out = [];
    const no = knowsFit() && blocked(j);
    if (no) out.push(["no", "circle-x", no.tag]);
    if (no?.tag === "US citizens only") return out; // the clearance tag would say it twice
    if (e.clearance) out.push(["clear", "shield-check", e.clearance === "active" ? `Active ${e.clearanceLevel || ""} clearance`.replace("  ", " ") : `${e.clearanceLevel || "Clearance"}-eligible`]);
    else if (e.citizen) out.push(["", "flag", "US citizens"]);
    if (e.degree && !no) out.push(["", "school", e.degree === "PhD" ? "PhD only" : "Grad students"]);
    if (e.grad && !no) out.push(["", "graduation-cap", `Grads ${gradSpan(e.grad)}`]);
    return out.slice(0, 2);
  }

  function card(j) {
    const h = hokieLine(j);
    const t = tags(j);
    return `<article class="job${knowsFit() && blocked(j) ? " out" : ""}" data-id="${esc(j.id)}">
      ${heart(j.id)}
      <div class="job-top">${logo(j)}<div class="job-co"><b>${esc(j.company)}</b><span>${esc(j.level === "Co-op" ? "Co-op" : j.term || "Internship")}</span></div></div>
      <h3>${esc(j.title)}</h3>
      <div class="job-meta">
        <span><i data-lucide="map-pin"></i>${esc(j.location)}</span>
        <span class="${j.minutesAgo < 1440 ? "new" : ""}"><i data-lucide="clock"></i>${when(j)}</span>
      </div>
      ${t.length ? `<div class="tags">${t.map(([cls, ic, label]) => `<span class="tag ${cls}"><i data-lucide="${ic}"></i>${esc(label)}</span>`).join("")}</div>` : ""}
      <div class="job-foot">
        ${h ? `<span class="hokie"><i data-lucide="users"></i>${esc(h)}</span>` : "<span></span>"}
        ${j.pay ? `<span class="pay">${esc(j.pay)}</span>` : ""}
      </div>
    </article>`;
  }

  function renderCats() {
    const counts = new Map();
    for (const j of JOBS) counts.set(j.fn, (counts.get(j.fn) || 0) + 1);
    const cats = [
      ...(hasPrefs() ? [["for-you", "For you", "sparkles"]] : []),
      ["all", "All", "layout-grid"],
      ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([fn]) => [fn, fn, FN_ICON[fn] || "briefcase"]),
    ];
    if (!cats.some(([k]) => k === cat)) cat = "all";
    $("#cats").innerHTML = cats.map(([k, label, ic]) => `<button class="cat" data-cat="${esc(k)}" aria-pressed="${k === cat}"><i data-lucide="${ic}"></i>${esc(label)}</button>`).join("");
  }

  function render() {
    const xs = list();
    $("#grid").innerHTML = xs.slice(0, shown).map(card).join("");
    $("#empty").hidden = xs.length > 0;
    $("#more").parentNode.hidden = xs.length <= shown;
    const today = xs.filter((j) => j.minutesAgo < 1440).length;
    const out = filters.eligible && knowsFit() ? JOBS.filter((j) => matches(j, { ...filters, eligible: false }) && blocked(j)).length : 0;
    $("#tally").innerHTML = `<b>${fmt(xs.length)}</b> internship${xs.length === 1 ? "" : "s"}${today ? ` · ${fmt(today)} new today` : ""}${out ? ` · <button class="link" id="show-out">${fmt(out)} you can't apply to</button>` : ""}${!filters.eligible && knowsFit() ? ` · <button class="link" id="hide-out">hide ones you can't apply to</button>` : ""}${medianLag != null ? `<span class="lag"> · on Alum ~${medianLag < 2 ? "1m" : ago(medianLag).replace(" ago", "")} after posting</span>` : ""}`;
    if (sort === "fit" && !knowsFit()) sort = "new";
    $('.sort [data-sort="fit"]').hidden = !knowsFit();
    $("#filter-dot").hidden = !activeFilters();
    $$(".sort button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.sort === sort));
    $$(".cat").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === cat));
    icons();
  }

  // Detail -------------------------------------------------------------------

  function detail(j) {
    const h = hires(j);
    const mine = h && profile.major ? h.byMajor[profile.major] : 0;
    const linkedin = `https://www.linkedin.com/school/virginia-tech/people/?keywords=${encodeURIComponent(j.company)}`;
    const facts = [
      ["map-pin", j.location],
      ["building", j.arrangement],
      ["calendar", j.level === "Co-op" ? "Co-op" : j.term || "Internship"],
      ["wallet", j.pay],
      ["clock", freshness(j)],
    ].filter(([, v]) => v);
    const rows = asks(j);
    const MARK = { ok: "circle-check", warn: "circle-alert", no: "circle-x" };

    $("#detail-body").innerHTML = `
      <div class="d-head">${logo(j, "lg")}<div><b>${esc(j.company)}</b><p>${esc(j.fn)}</p></div></div>
      <h2 class="d-title" id="d-title">${esc(j.title)}</h2>
      <div class="facts">${facts.map(([ic, v]) => `<span><i data-lucide="${ic}"></i>${esc(v)}</span>`).join("")}</div>
      <div class="d-actions">
        <a class="primary" href="${esc(j.url)}" target="_blank" rel="noopener" data-apply="${esc(j.id)}">Apply on ${esc(j.company)}<i data-lucide="arrow-up-right"></i></a>
        <button class="secondary ${saved[j.id] ? "on" : ""}" data-save="${esc(j.id)}" aria-label="Save"><i data-lucide="heart"></i></button>
      </div>

      <div class="section">
        <h3><i data-lucide="list-checks"></i>Who can apply</h3>
        ${rows.length ? `
          ${knowsFit() ? "" : `<p>Add your class year, degree and work status in <button class="link" data-tab="profile">Profile</button> to check these against you.</p>`}
          <ul class="asks">${rows.map((r) => `<li class="${r.state || ""}"><i data-lucide="${(r.state && MARK[r.state]) || r.icon}"></i><span>${r.html ? r.text : esc(r.text)}</span></li>`).join("")}</ul>`
        : `<p>The posting doesn't state a graduation window, citizenship, clearance or GPA rule${j.ats === "amzn" || !j.elig ? " that we could read" : ""}. Check the full description before you apply.</p>`}
      </div>

      ${j.summary ? `<div class="section"><h3><i data-lucide="file-text"></i>About the role</h3><p>${esc(j.summary)}</p>${j.requirements ? `<p>${esc(j.requirements)}</p>` : ""}</div>` : ""}

      <div class="section">
        <h3><i data-lucide="graduation-cap"></i>Hokies hired here</h3>
        ${h ? `
          <div class="stat">${fmt(h.n)}</div>
          <p>VT grads went to ${esc(j.company)} since the class of ${since}, ${fmt(h.recent)} of them from ${recentSpan}.${mine ? ` ${fmt(mine)} were ${esc(profile.major)} majors.` : ""}</p>
          <div class="pills">${Object.entries(h.byMajor).slice(0, 6).map(([m, n]) => `<span class="pill">${esc(m)}<b>${n}</b></span>`).join("")}</div>
          <ul class="titles">${h.titles.slice(0, 5).map(([t, n]) => `<li><span>${esc(t)}</span><b>${n}</b></li>`).join("")}</ul>`
        : `<p>No VT grads reported a first job here since the class of ${since}. Could be a new door.</p>`}
      </div>

      <div class="section">
        <h3><i data-lucide="users"></i>Find a Hokie there</h3>
        <p>An alum on the team is the warmest way in. LinkedIn shows you the ones at ${esc(j.company)}.</p>
        <div class="row-actions">
          <a class="secondary" href="${linkedin}" target="_blank" rel="noopener"><i data-lucide="search"></i>Hokies at ${esc(j.company)}</a>
          <button class="secondary" data-draft="${esc(j.id)}"><i data-lucide="copy"></i>Copy a message</button>
        </div>
      </div>

      <p class="fine">${h ? `Hiring numbers from <a href="${esc(P.sourceUrl)}" target="_blank" rel="noopener">VT's First Destination Report</a>, self-reported first jobs. ` : ""}Not affiliated with Virginia Tech.</p>`;
    open("#detail");
  }

  // "Posted 3h ago · on Alum 12 min later", or as much of it as we know.
  function freshness(j) {
    const lag = lagMin(j);
    if (lag != null && lag >= 0) return `Posted ${when(j).toLowerCase()} · on Alum ${lag < 2 ? "within a minute" : `${ago(lag).replace(" ago", "")} later`}`;
    if (j.postedApprox) return `Posted ${when(j).toLowerCase()} · board gives the day, not the time`;
    return `Posted ${when(j).toLowerCase()}`;
  }

  function draft(j) {
    const me = [profile.name ? `I'm ${profile.name},` : "I'm", "a", profile.year ? `class of ${profile.year}` : "", profile.major || "", "student at Virginia Tech."].filter(Boolean).join(" ");
    return `Hi [name], ${me} I'm applying to the ${j.title} role at ${j.company} and saw you're a fellow Hokie there. Would you be open to a quick 15-minute chat about the team and what helped you get in? Thank you!${profile.name ? `\n\n${profile.name}` : ""}`;
  }

  // Filters sheet -------------------------------------------------------------

  let draftF = null;
  function renderFilters() {
    const chip = (group, v, label = v, icon) => {
      const on = group === "posted" ? draftF.posted === v : draftF[group].has(v);
      return `<button class="chip" data-f="${group}" data-v="${esc(v)}" aria-pressed="${on}">${icon ? `<i data-lucide="${icon}"></i>` : ""}${esc(label)}</button>`;
    };
    const toggle = (k, title, sub) => `<label class="toggle"><span>${title}<small>${sub}</small></span><input type="checkbox" data-t="${k}" ${draftF[k] ? "checked" : ""} /></label>`;
    $("#filter-body").innerHTML = `
      <div class="f-group"><h3>Posted</h3><div class="chips">${[["all", "Any time"], ["1", "Last 24 hours"], ["3", "Last 3 days"], ["7", "Last week"]].map(([v, l]) => chip("posted", v, l)).join("")}</div></div>
      <div class="f-group"><h3>Type</h3><div class="chips">${LEVELS.map((l) => chip("levels", l)).join("")}</div></div>
      <div class="f-group"><h3>Where</h3><div class="chips">${Object.keys(PLACES).map((p) => chip("places", p, p, p === "Remote" ? "wifi" : "map-pin")).join("")}</div></div>
      <div class="f-group"><h3>Security clearance</h3><div class="chips">${[["none", "Not mentioned"], ["obtain", "Can get one once hired"], ["active", "Must already hold one"]].map(([v, l]) => chip("clearance", v, l)).join("")}</div></div>
      <div class="f-group">
        ${toggle("eligible", "Only ones I can apply for", knowsFit() ? "Hides roles your class year, degree, GPA or work status rules out" : "Set your class year and work status in Profile first")}
        ${toggle("pipeline", "Proven Hokie employers", `Hired ${PIPELINE}+ VT grads from the classes of ${recentSpan}`)}
        ${toggle("pay", "Shows pay", "Only internships that list a salary or hourly rate")}
      </div>`;
    $("#apply").textContent = `Show ${fmt(JOBS.filter((j) => matches(j, draftF)).length)} internships`;
    icons();
  }

  // Profile -------------------------------------------------------------------

  function renderProfile() {
    const majors = (P?.majors || []).filter(([, n]) => n >= 20).map(([m]) => m).sort();
    $("#p-name").value = profile.name;
    $("#p-major").innerHTML = `<option value="">Pick your major</option>${majors.map((m) => `<option ${m === profile.major ? "selected" : ""}>${esc(m)}</option>`).join("")}`;
    const year = new Date().getFullYear();
    $("#p-year").innerHTML = `<option value="">Pick a year</option>${[0, 1, 2, 3, 4].map((d) => year + d).map((y) => `<option ${String(y) === String(profile.year) ? "selected" : ""}>${y}</option>`).join("")}`;
    $("#p-term").innerHTML = ["Summer 2027", "Fall 2027", "Spring 2027", "Summer 2028", "Any time"].map((t) => `<option ${t === profile.term ? "selected" : ""}>${t}</option>`).join("");
    $("#p-degree").innerHTML = DEGREES.map((d) => `<option ${d === profile.degree ? "selected" : ""}>${d}</option>`).join("");
    $("#p-work").innerHTML = `<option value="">Prefer not to say</option>${Object.entries(WORK).map(([k, l]) => `<option value="${k}" ${k === profile.work ? "selected" : ""}>${l}</option>`).join("")}`;
    $("#p-gpa").value = profile.gpa;
    // The tools internships here ask for most, plus whatever you already picked.
    const counts = new Map();
    for (const j of JOBS) for (const s of j.skills || []) counts.set(s, (counts.get(s) || 0) + 1);
    const tools = [...new Set([...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([s]) => s), ...profile.skills])];
    $("#p-skills").innerHTML = tools.map((s) => `<button class="chip" data-s="${esc(s)}" aria-pressed="${profile.skills.includes(s)}">${esc(s)}</button>`).join("");
    const fns = [...new Set(JOBS.map((j) => j.fn))].sort();
    $("#p-interests").innerHTML = fns.map((f) => `<button class="chip" data-i="${esc(f)}" aria-pressed="${profile.interests.includes(f)}"><i data-lucide="${FN_ICON[f] || "briefcase"}"></i>${esc(f)}</button>`).join("");
    $("#p-places").innerHTML = [...Object.keys(PLACES), "Anywhere"].map((p) => `<button class="chip" data-p="${esc(p)}" aria-pressed="${profile.places.includes(p)}">${esc(p)}</button>`).join("");
    renderSaved();
    icons();
  }

  const STATUSES = ["Saved", "Applied", "Interviewing", "Offer", "Rejected"];
  function renderSaved() {
    const rows = Object.entries(saved).sort((a, b) => b[1].at - a[1].at);
    renderSavedCount();
    $("#saved-list").innerHTML = rows.length
      ? rows.map(([id, s]) => {
          const j = byId.get(id) || s.job;
          return `<div class="saved">
            ${logo(j)}
            <div class="saved-text" data-open="${esc(id)}"><b>${esc(j.title)}</b><span>${esc(j.company)} · ${esc(j.location)}${byId.has(id) ? "" : " · no longer listed"}</span></div>
            <select class="status" data-status="${esc(id)}" data-v="${s.status}">${STATUSES.map((x) => `<option ${x === s.status ? "selected" : ""}>${x}</option>`).join("")}</select>
            <button class="remove" data-unsave="${esc(id)}" aria-label="Remove"><i data-lucide="x"></i></button>
          </div>`;
        }).join("")
      : `<div class="none"><i data-lucide="heart"></i><p>Tap the heart on an internship to keep it here.</p></div>`;
  }
  const renderSavedCount = () => { const n = Object.keys(saved).length; $("#saved-count").textContent = n ? `${n}` : ""; };

  function toggleSave(id) {
    if (saved[id]) delete saved[id];
    else {
      const j = byId.get(id);
      saved[id] = { status: "Saved", at: Date.now(), job: { id, title: j.title, company: j.company, domain: j.domain, location: j.location, url: j.url } };
      toast("Saved to your profile");
    }
    saveSaved();
    $$(`[data-save="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle("on", !!saved[id]));
  }

  // Tabs, modals, toasts ---------------------------------------------------------

  function tab(name) {
    close();
    $(".switch").dataset.on = name;
    $$(".switch [role=tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
    $("#internships").hidden = name !== "internships";
    $("#profile").hidden = name !== "profile";
    if (name === "profile") renderProfile();
    else { renderCats(); render(); }
    history.replaceState(null, "", name === "profile" ? "#profile" : location.pathname + location.search);
    scrollTo({ top: 0 });
  }

  let current = null;
  function open(sel) { close(); current = $(sel); current.hidden = false; document.body.style.overflow = "hidden"; icons(); }
  function close() { if (current) current.hidden = true; current = null; document.body.style.overflow = ""; }

  let toastTimer;
  function toast(html, ms = 2200) {
    const t = $("#toast");
    t.innerHTML = html;
    t.hidden = false;
    clearTimeout(toastTimer);
    if (ms) toastTimer = setTimeout(() => (t.hidden = true), ms);
  }
  function flash(el, text) { el.textContent = text; el.style.opacity = 1; clearTimeout(el._t); el._t = setTimeout(() => (el.style.opacity = 0), 1200); }

  // After "Apply" opens the employer's page: when the student comes back,
  // ask once whether they applied, and track it.
  let pendingApply = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !pendingApply) return;
    const id = pendingApply;
    pendingApply = null;
    toast(`Did you apply? <button class="link" data-applied="${esc(id)}" style="color:#fff;margin-left:10px">Yes, track it</button>`, 8000);
  });

  // Events ----------------------------------------------------------------------

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a, article, [data-open]") || e.target;
    if (t.dataset?.tab) return tab(t.dataset.tab);
    if (t.dataset?.save) { e.stopPropagation(); return toggleSave(t.dataset.save); }
    if (t.dataset?.unsave) { delete saved[t.dataset.unsave]; saveSaved(); renderSaved(); icons(); return; }
    if (t.dataset?.apply) { pendingApply = t.dataset.apply; return; }
    if (t.dataset?.applied) {
      const id = t.dataset.applied;
      if (!saved[id]) toggleSave(id);
      saved[id].status = "Applied";
      saveSaved();
      return toast("Moved to Applied");
    }
    if (t.dataset?.draft) {
      navigator.clipboard?.writeText(draft(byId.get(t.dataset.draft))).then(() => toast("Message copied. Paste it into LinkedIn."), () => toast("Couldn't copy"));
      return;
    }
    if (t.dataset?.cat) { cat = t.dataset.cat; shown = PAGE; return render(); }
    if (t.dataset?.sort) { sort = t.dataset.sort; shown = PAGE; return render(); }
    if (t.dataset?.f) {
      const { f, v } = t.dataset;
      if (f === "posted") draftF.posted = v;
      else draftF[f].has(v) ? draftF[f].delete(v) : draftF[f].add(v);
      return renderFilters();
    }
    if (t.dataset?.i) {
      const v = t.dataset.i;
      profile.interests = profile.interests.includes(v) ? profile.interests.filter((x) => x !== v) : [...profile.interests, v];
      t.setAttribute("aria-pressed", profile.interests.includes(v));
      if (hasPrefs()) cat = "for-you";
      return saveProfile();
    }
    if (t.dataset?.s) {
      const v = t.dataset.s;
      profile.skills = profile.skills.includes(v) ? profile.skills.filter((x) => x !== v) : [...profile.skills, v];
      t.setAttribute("aria-pressed", profile.skills.includes(v));
      return saveProfile();
    }
    if (t.id === "show-out" || t.id === "hide-out") { filters.eligible = t.id === "hide-out"; return render(); }
    if (t.dataset?.p) {
      const v = t.dataset.p;
      profile.places = profile.places.includes(v) ? profile.places.filter((x) => x !== v) : [...profile.places, v];
      t.setAttribute("aria-pressed", profile.places.includes(v));
      if (hasPrefs()) cat = "for-you";
      return saveProfile();
    }
    if (t.dataset?.open) { const j = byId.get(t.dataset.open); return j ? detail(j) : window.open(saved[t.dataset.open]?.job.url, "_blank", "noopener"); }
    if (t.closest?.("[data-close]") || e.target.classList.contains("modal")) return close();
    if (t.matches?.("article.job")) return detail(byId.get(t.dataset.id));
  });

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.t) { draftF[t.dataset.t] = t.checked; return renderFilters(); }
    if (t.dataset.status) { saved[t.dataset.status].status = t.value; t.dataset.v = t.value; saveSaved(); return; }
    if (t.id === "p-major") { profile.major = t.value; saveProfile(); }
    if (t.id === "p-year") { profile.year = t.value; saveProfile(); }
    if (t.id === "p-term") { profile.term = t.value; saveProfile(); }
    if (t.id === "p-degree") { profile.degree = t.value; saveProfile(); }
    if (t.id === "p-work") { profile.work = t.value; saveProfile(); }
  });
  $("#p-name").addEventListener("input", (e) => { profile.name = e.target.value.trim(); saveProfile(); });
  $("#p-gpa").addEventListener("input", (e) => { const g = Number(e.target.value); profile.gpa = g > 0 && g <= 4 ? String(g) : ""; saveProfile(); });

  $("#open-filters").addEventListener("click", () => {
    draftF = { ...filters, levels: new Set(filters.levels), places: new Set(filters.places), clearance: new Set(filters.clearance) };
    renderFilters();
    open("#filters");
  });
  $("#apply").addEventListener("click", () => { filters = draftF; shown = PAGE; close(); render(); });
  $("#clear").addEventListener("click", () => { draftF = blank(); renderFilters(); });
  $("#clear-empty").addEventListener("click", () => { filters = blank(); cat = "all"; q = ""; $("#q").value = ""; render(); });
  $("#more").addEventListener("click", () => { shown += PAGE; render(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  let qTimer;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { q = e.target.value.trim(); if (q && cat === "for-you") cat = "all"; shown = PAGE; render(); }, 120);
  });

  // Go ----------------------------------------------------------------------------

  document.title = `Alum · ${school.name}`;
  const updated = minutes(data.generatedAt);
  $("#updated").textContent = `Updated ${ago(updated).toLowerCase()}`;
  if (medianLag != null) $("#updated").title = `New postings reach Alum a median ${medianLag < 2 ? "1 minute" : ago(medianLag).replace(" ago", "")} after the employer posts them (last 14 days).`;
  renderSavedCount();
  tab(location.hash === "#profile" ? "profile" : "internships");
})();
