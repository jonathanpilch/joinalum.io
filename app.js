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
 * tools) becomes a row that the profile marks ok, a gap, or a dealbreaker.
 * That logic lives in lib/core.js so the radar emails judge jobs the same
 * way; lib/account.js is sign-in and sync (Supabase), absent when the site
 * isn't configured, in which case everything stays on this device. */
import * as core from "./lib/core.js";
import { LEVELS, PIPELINE, PLACES, DEGREES, WORK, PROFILE, esc, gradSpan } from "./lib/core.js";
import { account } from "./lib/account.js";

(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const school = SCHOOLS[new URLSearchParams(location.search).get("school")] || SCHOOLS.vt;
  const PAGE = 24;
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
  const hires = (j) => core.hiresOf(P, j);
  const since = P ? P.cohorts[0].slice(5) : "";
  const recentSpan = P ? `${P.recentCohorts[0].slice(5)}–${P.recentCohorts.at(-1).slice(5)}` : "";

  // "Computer Science" -> "CS", "Finance" -> "Finance"
  const short = (m) => (m.split(/\s+/).length > 1 ? m.split(/\s+/).filter((w) => !/^(and|of|&)$/i.test(w)).map((w) => w[0]).join("").toUpperCase() : m);

  // Profile + saved ---------------------------------------------------------

  let profile = { ...PROFILE, ...store.get("alum.profile", {}) };
  // id -> { status, at, updatedAt, job: {snapshot}, deadline, remindOn, notes, history }
  let saved = store.get("alum.saved", {});
  // [{ id, name, search: {q, cat, filters}, cadence, last_seen_at, remote }]
  let radars = store.get("alum.radars", []);
  const saveProfile = () => { store.set("alum.profile", profile); account.saveProfile(profile); flash($("#saved-note"), "Saved"); };
  const saveSaved = () => { store.set("alum.saved", saved); renderSavedCount(); };
  const saveRadars = () => store.set("alum.radars", radars);
  // One saved role changed: keep it here, and in the account when signed in.
  function touch(id) {
    saved[id].updatedAt = Date.now();
    saveSaved();
    account.putSaved(id, saved[id])?.catch(() => toast("Couldn't sync that change. It's saved on this device."));
  }
  const hasPrefs = () => profile.interests.length || profile.places.filter((p) => p !== "Anywhere").length;

  function majorHires(j) {
    const h = hires(j);
    if (!h) return null;
    const mine = profile.major && h.byMajor[profile.major];
    return mine ? { n: mine, label: `${fmt(mine)} ${short(profile.major)} Hokies hired` } : { n: h.n, label: `${fmt(h.n)} Hokies hired` };
  }

  // Fit: the profile against what a posting asks for (lib/core.js).
  const asks = (j) => core.asks(j, profile);
  const blocked = (j) => core.blocked(j, profile);
  const knowsFit = () => core.knowsFit(profile);
  const fitScore = (j) => core.fitScore(j, profile, P);

  // Internships: state, filtering ----------------------------------------------

  const blank = core.blankFilters;
  let filters = blank();
  let cat = hasPrefs() ? "for-you" : "all";
  let sort = "new";
  let q = "";
  let shown = PAGE;

  const matches = (j, f = filters, c = cat) => core.matches(j, { q, cat: c, filters: f }, { profile, P, now });

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

      ${account.enabled ? `<div class="section">
        <h3><i data-lucide="messages-square"></i>${esc(school.demonym)} on interviewing here</h3>
        <div id="notes" data-job="${esc(j.id)}"><p>Loading…</p></div>
      </div>` : ""}

      <p class="fine">${h ? `Hiring numbers from <a href="${esc(P.sourceUrl)}" target="_blank" rel="noopener">VT's First Destination Report</a>, self-reported first jobs. ` : ""}Not affiliated with Virginia Tech.</p>`;
    open("#detail");
    if (account.enabled) renderNotes(j);
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
    renderAccount();
    renderRadars();
    renderSaved();
    icons();
  }

  const STATUSES = ["Saved", "Applied", "Interviewing", "Offer", "Rejected"];
  let openRow = null;
  const dateLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  function renderSaved() {
    const rows = Object.entries(saved).sort((a, b) => b[1].at - a[1].at);
    renderSavedCount();
    $("#saved-list").innerHTML = rows.length
      ? rows.map(([id, s]) => {
          const j = byId.get(id) || s.job;
          const due = s.deadline ? `Due ${dateLabel(s.deadline)}` : s.remindOn ? `Reminder ${dateLabel(s.remindOn)}` : "";
          return `<div class="saved-wrap">
            <div class="saved">
              ${logo(j)}
              <div class="saved-text" data-open="${esc(id)}"><b>${esc(j.title)}</b><span>${esc(j.company)} · ${esc(j.location)}${byId.has(id) ? "" : " · no longer listed"}${due ? ` · <em>${due}</em>` : ""}</span></div>
              <select class="status" data-status="${esc(id)}" data-v="${s.status}">${STATUSES.map((x) => `<option ${x === s.status ? "selected" : ""}>${x}</option>`).join("")}</select>
              <button class="remove" data-more="${esc(id)}" aria-label="Details" aria-expanded="${openRow === id}"><i data-lucide="chevron-down"></i></button>
            </div>
            ${openRow === id ? `<div class="saved-more">
              <label class="field"><span>Application deadline</span><input type="date" data-track="${esc(id)}" data-field="deadline" value="${esc(s.deadline || "")}" /></label>
              <label class="field"><span>Remind me on</span><input type="date" data-track="${esc(id)}" data-field="remindOn" value="${esc(s.remindOn || "")}" /></label>
              <label class="field wide"><span>Notes</span><textarea data-track="${esc(id)}" data-field="notes" rows="3" maxlength="4000" placeholder="Referral from…, recruiter's name, what to follow up on">${esc(s.notes || "")}</textarea></label>
              ${account.enabled ? `<p class="fine-inline">${account.user ? "We'll email you on the reminder date." : "Sign in above to get the reminder by email."}</p>` : ""}
              <div class="row-actions">
                ${account.user && s.status !== "Saved" ? `<button class="secondary" data-report="${esc(id)}"><i data-lucide="message-square-plus"></i>Share how it went</button>` : ""}
                <button class="secondary" data-unsave="${esc(id)}"><i data-lucide="trash-2"></i>Remove</button>
              </div>
            </div>` : ""}
          </div>`;
        }).join("")
      : `<div class="none"><i data-lucide="heart"></i><p>Tap the heart on an internship to keep it here.</p></div>`;
  }
  const renderSavedCount = () => { const n = Object.keys(saved).length; $("#saved-count").textContent = n ? `${n}` : ""; };

  function toggleSave(id) {
    if (saved[id]) unsave(id);
    else {
      const j = byId.get(id);
      saved[id] = { status: "Saved", at: Date.now(), history: [{ status: "Saved", at: new Date().toISOString() }], job: { id, title: j.title, company: j.company, domain: j.domain, location: j.location, url: j.url, term: j.term } };
      touch(id);
      toast("Saved to your profile");
    }
    $$(`[data-save="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle("on", !!saved[id]));
  }
  function unsave(id) {
    delete saved[id];
    saveSaved();
    account.dropSaved(id);
  }

  // A tracked role moves along. Past the application, ask how it went: the
  // notes are what make the next Hokie's interview easier.
  function setStatus(id, status) {
    const s = saved[id];
    if (!s || s.status === status) return;
    s.status = status;
    s.history = [...(s.history || []), { status, at: new Date().toISOString() }];
    touch(id);
    if (["Interviewing", "Offer", "Rejected"].includes(status) && account.user) {
      toast(`Help the next Hokie: <button class="link" data-report="${esc(id)}" style="color:#fff;margin-left:6px">share how ${esc(s.job.company)} went</button>`, 9000);
    }
  }

  // Radars ----------------------------------------------------------------------
  //
  // A radar is a saved search. Signed out it lives here and counts what's new
  // since you last opened it; signed in it also emails you (ingest/notify.mjs).

  const CADENCES = { instant: "Within the hour", daily: "Daily", weekly: "Weekly", off: "Email off" };
  const currentSearch = () => ({ q, cat, filters: core.filtersToJSON(filters) });
  const fresh = (r) => JOBS.filter((j) => Date.parse(j.firstSeenAt) > Date.parse(r.last_seen_at) && core.matches(j, { ...r.search, filters: core.filtersFromJSON(r.search.filters) }, { profile, P, now })).length;

  function newRadar() {
    const search = currentSearch();
    const name = core.describe({ ...search, filters });
    $("#radar-new-body").innerHTML = `
      <label class="field"><span>Name</span><input id="rn-name" maxlength="80" value="${esc(name)}" /></label>
      <p class="sub small">${fmt(list().length)} internships match today. ${account.user ? "How often should we email you new ones?" : `Your Profile will count new matches.${account.enabled ? " Sign in there to get them by email." : ""}`}</p>
      ${account.user ? `<div class="chips" id="rn-cadence">${Object.entries(CADENCES).map(([k, l]) => `<button class="chip" data-rn="${k}" aria-pressed="${k === "daily"}">${l}</button>`).join("")}</div>` : ""}`;
    open("#radar-new");
    $("#rn-name").select();
  }

  async function createRadar() {
    const cadence = $("#rn-cadence [aria-pressed=true]")?.dataset.rn || "daily";
    const r = { name: $("#rn-name").value.trim() || core.describe({ q, cat, filters }), search: currentSearch(), cadence, last_seen_at: new Date().toISOString() };
    try {
      radars.push(account.user ? await account.addRadar(r) : { ...r, id: `local-${Date.now()}` });
    } catch {
      return toast("Couldn't save that radar. Try again.");
    }
    saveRadars();
    close();
    toast(account.user && cadence !== "off" ? `Radar on. New matches come to your inbox ${cadence === "instant" ? "within the hour" : cadence}.` : "Radar saved to your Profile.");
  }

  function renderRadars() {
    $("#radar-count").textContent = radars.length ? `${radars.length}` : "";
    $("#radar-list").innerHTML = radars.length
      ? radars.map((r) => {
          const n = fresh(r);
          return `<div class="saved">
            <span class="logo radar"><i data-lucide="radar"></i></span>
            <div class="saved-text" data-radar="${esc(r.id)}"><b>${esc(r.name)}</b><span>${n ? `<em class="new">${fmt(n)} new</em> since you looked` : "Nothing new since you looked"}</span></div>
            ${account.user && r.remote ? `<select class="status" data-cadence="${esc(r.id)}">${Object.entries(CADENCES).map(([k, l]) => `<option value="${k}" ${k === r.cadence ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
            <button class="remove" data-unradar="${esc(r.id)}" aria-label="Delete radar"><i data-lucide="x"></i></button>
          </div>`;
        }).join("")
      : `<div class="none"><i data-lucide="radar"></i><p>No radars yet. Set up a search on Internships, then tap <b>Alert me</b>.</p></div>`;
  }

  // Open a radar: run its search, and reset its "new" count.
  function openRadar(id) {
    const r = radars.find((x) => x.id === id);
    if (!r) return;
    q = r.search.q || "";
    $("#q").value = q;
    cat = r.search.cat || "all";
    filters = core.filtersFromJSON(r.search.filters);
    sort = "new";
    r.last_seen_at = new Date().toISOString();
    saveRadars();
    if (r.remote) account.updateRadar(r.id, { last_seen_at: r.last_seen_at });
    tab("internships");
  }

  function setCadence(id, cadence) {
    const r = radars.find((x) => x.id === id);
    r.cadence = cadence;
    saveRadars();
    account.updateRadar(id, { cadence });
  }

  function dropRadar(id) {
    const r = radars.find((x) => x.id === id);
    radars = radars.filter((x) => x.id !== id);
    saveRadars();
    if (r?.remote) account.dropRadar(id);
    renderRadars();
    icons();
  }

  // Account -------------------------------------------------------------------

  function renderAccount() {
    const box = $("#account");
    box.hidden = !account.enabled;
    $("#resume-btn").hidden = !account.enabled;
    $("#about-sub").textContent = `Picks your internships, checks who can apply against you, and shows how many ${school.demonym} from your major got hired.${account.user ? "" : " Stays on this device until you sign in."}`;
    if (!account.enabled) return;
    const u = account.user;
    box.innerHTML = u
      ? `<div class="card-head"><h2>Signed in</h2><button class="link" id="sign-out">Sign out</button></div>
         <p class="sub">${esc(u.email)} · your profile, saved internships and radars sync to every device you sign in on.</p>`
      : `<div class="card-head"><h2>Sign in with your ${esc(school.domain)} email</h2></div>
         <p class="sub">Sync across devices, get radar alerts and reminders by email, fill your profile from your resume, and read interview notes from other ${esc(school.demonym)}.</p>
         <form class="signin" id="signin">
           <label class="field"><span>School email</span><input id="signin-email" type="email" autocomplete="email" placeholder="you@${esc(school.domain)}" required /></label>
           <button class="primary" type="submit">Email me a link</button>
         </form>`;
  }

  async function signIn(email) {
    if (!email.toLowerCase().endsWith(`@${school.domain}`)) return toast(`Use your @${esc(school.domain)} address.`);
    try {
      await account.signIn(email);
      $("#signin").outerHTML = `<p class="sent"><i data-lucide="mail-check"></i>We emailed ${esc(email)}. Type the code from it here.</p>
        <form class="signin" id="code-form" data-email="${esc(email)}">
          <label class="field"><span>Code</span><input id="signin-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="10" placeholder="12345678" required /></label>
          <button class="primary" type="submit">Sign in</button>
        </form>
        <p class="fine-inline">Can't find it? Check junk and quarantine: school mail filters sometimes hold new senders.</p>`;
      icons();
      $("#signin-code").focus();
    } catch (e) {
      toast(esc(e.message || "Couldn't send the link."));
    }
  }

  // Pull the account down, push this device's changes up, redraw.
  async function sync() {
    try {
      const r = await account.sync({ profile, saved, radars });
      profile = { ...PROFILE, ...r.profile };
      saved = r.saved;
      radars = r.radars;
      store.set("alum.profile", profile);
      saveSaved();
      saveRadars();
    } catch (e) {
      console.warn(e);
      toast("Couldn't reach your account. Showing what's on this device.");
    }
    tab($("#profile").hidden ? "internships" : "profile", true);
  }

  // Resume -> profile --------------------------------------------------------------
  //
  // Claude reads the PDF (supabase/functions/parse-resume) and suggests
  // fields; nothing changes until the student says yes. Work status is never
  // guessed from a resume.

  let suggestion = null;
  const majorsList = () => (P?.majors || []).filter(([, n]) => n >= 20).map(([m]) => m).sort();
  const toolsList = () => [...new Set(JOBS.flatMap((j) => j.skills || []))].sort();

  async function readResume(file) {
    $("#resume-file").value = "";
    if (!account.user) return toast("Sign in first: resume reading runs on your account.");
    if (file.size > 5 * 1024 * 1024) return toast("That PDF is over 5 MB. Try exporting a smaller one.");
    const box = $("#resume-review");
    box.hidden = false;
    box.innerHTML = `<p class="sent"><i data-lucide="loader-circle" class="spin"></i>Reading ${esc(file.name)}…</p>`;
    icons();
    try {
      suggestion = await account.parseResume(file, { majors: majorsList(), skills: toolsList(), functions: [...new Set(JOBS.map((j) => j.fn))].sort(), school: school.name });
    } catch (e) {
      box.innerHTML = `<p class="sent bad"><i data-lucide="circle-x"></i>${esc(e.message || "Couldn't read that resume.")}</p>`;
      return icons();
    }
    const rows = [
      ["name", "Name", suggestion.name],
      ["major", "Major", suggestion.major],
      ["year", "Graduating", suggestion.grad_year && `May ${suggestion.grad_year}`],
      ["degree", "Degree", suggestion.degree],
      ["gpa", "GPA", suggestion.gpa && suggestion.gpa.toFixed(2)],
      ["skills", "Tools", suggestion.skills?.length && suggestion.skills.join(", ")],
      ["interests", "Interested in", suggestion.interests?.length && suggestion.interests.join(", ")],
    ].filter(([, , v]) => v);
    box.innerHTML = rows.length
      ? `<h3>From your resume</h3>
         <ul class="asks">${rows.map(([k, l, v]) => `<li><label class="pick"><input type="checkbox" data-pick="${k}" checked /><span><b>${l}:</b> ${esc(v)}</span></label></li>`).join("")}</ul>
         <p class="fine-inline">Your resume isn't stored. Check these over before you use them.</p>
         <div class="row-actions"><button class="primary" id="resume-apply">Use these</button><button class="secondary" id="resume-discard">Discard</button></div>`
      : `<p class="sent"><i data-lucide="circle-alert"></i>Couldn't find profile details in that file.</p>`;
    icons();
  }

  function applyResume() {
    const pick = (k) => $(`[data-pick="${k}"]`)?.checked;
    const x = suggestion;
    if (pick("name")) profile.name = x.name.split(/\s+/)[0];
    if (pick("major")) profile.major = x.major;
    if (pick("year")) profile.year = String(x.grad_year);
    if (pick("degree")) profile.degree = x.degree;
    if (pick("gpa")) profile.gpa = String(x.gpa);
    if (pick("skills")) profile.skills = [...new Set([...profile.skills, ...x.skills])];
    if (pick("interests")) profile.interests = [...new Set([...profile.interests, ...x.interests])];
    suggestion = null;
    $("#resume-review").hidden = true;
    saveProfile();
    renderProfile();
    toast("Profile updated from your resume.");
  }

  // Interview notes ----------------------------------------------------------------

  const STAGES = { applied: "Applied, no interview", assessment: "Online assessment", phone: "Phone / recruiter screen", technical: "Technical interview", final: "Final round / superday", offer: "Offer" };
  const OUTCOMES = { offer: "Got an offer", rejected: "Rejected", ghosted: "Never heard back", pending: "Still waiting", withdrew: "I withdrew" };

  async function renderNotes(j) {
    const box = $("#notes");
    if (!box) return;
    if (!account.user) {
      box.innerHTML = `<p>Sign in with your ${esc(school.domain)} email on <button class="link" data-tab="profile">Profile</button> to read what ${esc(school.demonym)} say about interviewing at ${esc(j.company)}.</p>`;
      return;
    }
    let rs;
    try { rs = await account.reports(j.company); } catch { box.innerHTML = "<p>Couldn't load notes right now.</p>"; return; }
    if (!$("#notes") || box.dataset.job !== j.id) return; // the sheet moved on
    const add = `<div class="row-actions"><button class="secondary" data-report-job="${esc(j.id)}"><i data-lucide="message-square-plus"></i>Add your notes</button></div>`;
    if (!rs.length) { box.innerHTML = `<p>No ${esc(school.demonym)} have shared notes on ${esc(j.company)} yet. Been through it? Be the first.</p>${add}`; return icons(); }
    const n = rs.length;
    const offers = rs.filter((r) => r.outcome === "offer").length;
    const diff = rs.filter((r) => r.difficulty).map((r) => r.difficulty);
    const avg = diff.length ? (diff.reduce((a, b) => a + b, 0) / diff.length).toFixed(1) : null;
    const weeks = rs.filter((r) => r.weeks != null).map((r) => r.weeks).sort((a, b) => a - b);
    box.innerHTML = `
      <div class="stat-row">
        <div><div class="stat">${n}</div><small>note${n === 1 ? "" : "s"}</small></div>
        <div><div class="stat">${offers}</div><small>offer${offers === 1 ? "" : "s"}</small></div>
        ${avg ? `<div><div class="stat">${avg}<span>/5</span></div><small>difficulty</small></div>` : ""}
        ${weeks.length ? `<div><div class="stat">${weeks[Math.floor(weeks.length / 2)]}<span>wk</span></div><small>to hear back</small></div>` : ""}
      </div>
      <ul class="notes">${rs.slice(0, 6).map((r) => `<li>
        <div class="note-head"><b>${esc(r.job_title || "Intern")}</b><span>${esc([r.term, STAGES[r.stage], OUTCOMES[r.outcome]].filter(Boolean).join(" · "))}</span></div>
        ${r.questions ? `<p><em>Asked:</em> ${esc(r.questions)}</p>` : ""}
        ${r.tips ? `<p><em>Tip:</em> ${esc(r.tips)}</p>` : ""}
      </li>`).join("")}</ul>
      ${add}`;
    icons();
  }

  let reportFor = null;
  function openReport({ company, title, term, jobId }) {
    reportFor = { company, title, term, jobId };
    const sel = (id, opts) => `<select id="${id}">${Object.entries(opts).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>`;
    $("#report-body").innerHTML = `
      <p class="sub"><b>${esc(company)}</b>${title ? ` · ${esc(title)}` : ""}</p>
      <div class="fields">
        <label class="field"><span>How far you got</span>${sel("r-stage", STAGES)}</label>
        <label class="field"><span>Outcome</span>${sel("r-outcome", OUTCOMES)}</label>
        <label class="field"><span>Weeks from applying to hearing back</span><input id="r-weeks" type="number" min="0" max="52" inputmode="numeric" placeholder="Optional" /></label>
        <label class="field"><span>Difficulty (1 easy – 5 brutal)</span><input id="r-diff" type="number" min="1" max="5" inputmode="numeric" placeholder="Optional" /></label>
        <label class="field wide"><span>What they asked</span><textarea id="r-questions" rows="3" maxlength="2000" placeholder="Leetcode medium on graphs, a behavioral about a team conflict…"></textarea></label>
        <label class="field wide"><span>Advice for the next ${esc(school.demonym.replace(/s$/, ""))}</span><textarea id="r-tips" rows="3" maxlength="2000" placeholder="What you'd do differently, who to talk to, what mattered"></textarea></label>
      </div>`;
    open("#report");
  }

  async function sendReport() {
    const num = (id, lo, hi) => { const v = Number($(id).value); return $(id).value !== "" && v >= lo && v <= hi ? Math.round(v) : null; };
    const r = {
      company: reportFor.company, job_title: reportFor.title || null, job_id: reportFor.jobId || null, term: reportFor.term || null, school: school.slug,
      stage: $("#r-stage").value, outcome: $("#r-outcome").value, weeks: num("#r-weeks", 0, 52), difficulty: num("#r-diff", 1, 5),
      questions: $("#r-questions").value.trim(), tips: $("#r-tips").value.trim(),
    };
    try { await account.addReport(r); } catch (e) { return toast(esc(e.message || "Couldn't share that.")); }
    close();
    toast(`Thanks. That helps every ${esc(school.demonym.replace(/s$/, ""))} after you.`);
  }

  // Tabs, modals, toasts ---------------------------------------------------------

  function tab(name, keepScroll = false) {
    if (!keepScroll) close();
    $(".switch").dataset.on = name;
    $$(".switch [role=tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
    $("#internships").hidden = name !== "internships";
    $("#profile").hidden = name !== "profile";
    if (name === "profile") renderProfile();
    else { renderCats(); render(); }
    // Drop one-shot email links (?job, ?radar) from the address; keep ?school.
    const keep = new URLSearchParams(location.search);
    keep.delete("job"); keep.delete("radar");
    const path = location.pathname + (keep.size ? `?${keep}` : "");
    history.replaceState(null, "", name === "profile" ? `${path}#profile` : path);
    if (!keepScroll) scrollTo({ top: 0 });
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
    if (t.dataset?.unsave) { unsave(t.dataset.unsave); renderSaved(); icons(); return; }
    if (t.dataset?.apply) { pendingApply = t.dataset.apply; return; }
    if (t.dataset?.applied) {
      const id = t.dataset.applied;
      if (!saved[id]) toggleSave(id);
      setStatus(id, "Applied");
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
    if (t.id === "save-search") return newRadar();
    if (t.id === "radar-create") return createRadar();
    if (t.dataset?.rn) { $$("#rn-cadence .chip").forEach((b) => b.setAttribute("aria-pressed", b === t)); return; }
    if (t.dataset?.radar) return openRadar(t.dataset.radar);
    if (t.dataset?.unradar) return dropRadar(t.dataset.unradar);
    if (t.dataset?.more) { openRow = openRow === t.dataset.more ? null : t.dataset.more; renderSaved(); return icons(); }
    if (t.id === "sign-out") { account.signOut(); return; }
    if (t.id === "resume-btn") {
      if (!account.user) return toast("Sign in first: resume reading runs on your account.");
      return $("#resume-file").click();
    }
    if (t.id === "resume-apply") return applyResume();
    if (t.id === "resume-discard") { suggestion = null; $("#resume-review").hidden = true; return; }
    if (t.dataset?.report) { const s = saved[t.dataset.report]; return openReport({ company: s.job.company, title: s.job.title, term: s.job.term, jobId: t.dataset.report }); }
    if (t.dataset?.reportJob) { const j = byId.get(t.dataset.reportJob); return openReport({ company: j.company, title: j.title, term: j.term, jobId: j.id }); }
    if (t.id === "report-send") return sendReport();
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
    if (t.dataset.status) { setStatus(t.dataset.status, t.value); t.dataset.v = t.value; return; }
    if (t.dataset.track) {
      const [id, field] = [t.dataset.track, t.dataset.field];
      saved[id][field] = t.value || null;
      return touch(id);
    }
    if (t.dataset.cadence) return setCadence(t.dataset.cadence, t.value);
    if (t.id === "resume-file" && t.files[0]) return readResume(t.files[0]);
    if (t.id === "p-major") { profile.major = t.value; saveProfile(); }
    if (t.id === "p-year") { profile.year = t.value; saveProfile(); }
    if (t.id === "p-term") { profile.term = t.value; saveProfile(); }
    if (t.id === "p-degree") { profile.degree = t.value; saveProfile(); }
    if (t.id === "p-work") { profile.work = t.value; saveProfile(); }
  });
  document.addEventListener("submit", async (e) => {
    if (e.target.id === "signin") {
      e.preventDefault();
      return signIn($("#signin-email").value.trim());
    }
    if (e.target.id === "code-form") {
      e.preventDefault();
      const btn = e.target.querySelector("button");
      btn.disabled = true;
      try {
        // The sign-in listener (account.init) runs sync() and redraws.
        await account.verifyCode(e.target.dataset.email, $("#signin-code").value.trim());
        toast("Signed in.");
      } catch (err) {
        btn.disabled = false;
        toast(/expired|invalid/i.test(err.message) ? "That code didn't work or has expired. Request a new one." : esc(err.message));
      }
    }
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
  // Links from emails: ?job=<id> opens that internship, ?radar=<id> its search.
  const params = new URLSearchParams(location.search);
  renderSavedCount();
  tab(location.hash === "#profile" || location.hash === "#radars" ? "profile" : "internships");

  const deep = () => {
    if (params.get("radar")) openRadar(params.get("radar"));
    const j = byId.get(params.get("job"));
    if (j) detail(j);
    else if (params.get("job")) toast("That internship isn't listed anymore.");
  };

  if (account.enabled) {
    await account.init((u) => (u ? sync() : tab($("#profile").hidden ? "internships" : "profile", true)));
    if (account.user) await sync();
  }
  deep();
})();
