/* Alum -- two views behind one sliding switch: Internships and Profile.
 *
 * Internships come from data/jobs.json (written hourly by ingest/run.mjs);
 * "Hokies hired" comes from data/placements.json (VT's First Destination
 * Report). The profile and saved internships live in localStorage until
 * sign-in exists. Icons are Lucide: render HTML with <i data-lucide>, then
 * call icons(). */
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
  const hires = (j) => (P && P.employers[P.boardIndex?.[j.company]]) || null;
  const since = P ? P.cohorts[0].slice(5) : "";
  const recentSpan = P ? `${P.recentCohorts[0].slice(5)}–${P.recentCohorts.at(-1).slice(5)}` : "";

  // "Computer Science" -> "CS", "Finance" -> "Finance"
  const short = (m) => (m.split(/\s+/).length > 1 ? m.split(/\s+/).filter((w) => !/^(and|of|&)$/i.test(w)).map((w) => w[0]).join("").toUpperCase() : m);

  // Profile + saved ---------------------------------------------------------

  let profile = store.get("alum.profile", { name: "", major: "", year: "", term: "Summer 2027", interests: [], places: [] });
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

  // Internships: state, filtering ----------------------------------------------

  const blank = () => ({ posted: "all", levels: new Set(), places: new Set(), pipeline: false, pay: false });
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

  function matches(j, f = filters, c = cat) {
    if (c === "for-you" && !forYou(j)) return false;
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

  const activeFilters = () => (filters.posted !== "all") + filters.levels.size + filters.places.size + filters.pipeline + filters.pay;

  function list() {
    const xs = JOBS.filter((j) => matches(j));
    if (sort === "hokies") xs.sort((a, b) => (majorHires(b)?.n || 0) - (majorHires(a)?.n || 0) || a.minutesAgo - b.minutesAgo);
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

  function card(j) {
    const h = majorHires(j);
    return `<article class="job" data-id="${esc(j.id)}">
      ${heart(j.id)}
      <div class="job-top">${logo(j)}<div class="job-co"><b>${esc(j.company)}</b><span>${esc(j.level === "Co-op" ? "Co-op" : j.term || "Internship")}</span></div></div>
      <h3>${esc(j.title)}</h3>
      <div class="job-meta">
        <span><i data-lucide="map-pin"></i>${esc(j.location)}</span>
        <span class="${j.minutesAgo < 1440 ? "new" : ""}"><i data-lucide="clock"></i>${when(j)}</span>
      </div>
      <div class="job-foot">
        ${h ? `<span class="hokie"><i data-lucide="graduation-cap"></i>${esc(h.label)}</span>` : "<span></span>"}
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
    $("#tally").innerHTML = `<b>${fmt(xs.length)}</b> internship${xs.length === 1 ? "" : "s"}${today ? ` · ${fmt(today)} new today` : ""}`;
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
      ["clock", `Posted ${when(j).toLowerCase()}`],
    ].filter(([, v]) => v);

    $("#detail-body").innerHTML = `
      <div class="d-head">${logo(j, "lg")}<div><b>${esc(j.company)}</b><p>${esc(j.fn)}</p></div></div>
      <h2 class="d-title" id="d-title">${esc(j.title)}</h2>
      <div class="facts">${facts.map(([ic, v]) => `<span><i data-lucide="${ic}"></i>${esc(v)}</span>`).join("")}</div>
      <div class="d-actions">
        <a class="primary" href="${esc(j.url)}" target="_blank" rel="noopener" data-apply="${esc(j.id)}">Apply on ${esc(j.company)}<i data-lucide="arrow-up-right"></i></a>
        <button class="secondary ${saved[j.id] ? "on" : ""}" data-save="${esc(j.id)}" aria-label="Save"><i data-lucide="heart"></i></button>
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
      <div class="f-group">
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
  });
  $("#p-name").addEventListener("input", (e) => { profile.name = e.target.value.trim(); saveProfile(); });

  $("#open-filters").addEventListener("click", () => {
    draftF = { ...filters, levels: new Set(filters.levels), places: new Set(filters.places) };
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
  renderSavedCount();
  tab(location.hash === "#profile" ? "profile" : "internships");
})();
