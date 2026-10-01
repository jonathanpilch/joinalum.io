/* Alum -- the explore board. One school per page (?school=slug, default vt).
 * Roles come from data/jobs.json, written hourly by ingest/run.mjs straight
 * from each company's own careers board. */
(async function () {
  const $ = (s, el = document) => el.querySelector(s);
  const params = new URLSearchParams(location.search);
  const school = SCHOOLS[params.get("school")] || SCHOOLS.vt;
  const PAGE = 30;

  const icon = {
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    caret: '<svg class="caret" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const initials = (name) => name.split(/\s+/).filter((w) => /^[A-Z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || name[0];
  const fmt = (n) => n.toLocaleString("en-US");
  const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const ATS = { gh: "Greenhouse", lv: "Lever", ab: "Ashby", sr: "SmartRecruiters", wd: "Workday", amzn: "amazon.jobs" };

  // School identity ---------------------------------------------------

  document.documentElement.style.setProperty("--backdrop-image", `url("${school.backdrop}")`);
  document.title = `Alum · ${school.name}`;
  $("#school-mark").src = school.mark;
  $("#school-name").textContent = school.name;
  $("#hero-eyebrow").textContent = `Built by ${school.demonym}, for ${school.demonym}`;
  $("#hero-title").innerHTML = "Tech internships and<br />new-grad roles, first.";

  // Data ----------------------------------------------------------------

  let data;
  try {
    data = await fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json());
  } catch {
    $("#rows").innerHTML = '<div class="empty"><p>No data yet. Run <code>npm run ingest</code>.</p></div>';
    return;
  }
  const now = Date.now();
  const JOBS = data.jobs.map((j) => ({ ...j, minutesAgo: Math.max(0, Math.round((now - Date.parse(j.postedAt)) / 60000)) }));
  const companyCount = new Set(JOBS.map((j) => j.company)).size;
  // Where Hokies were actually hired (VT's First Destination Report), keyed
  // by board company. Optional: the board works without it.
  const P = await fetch("data/placements.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => null);
  const hires = (j) => (P && P.employers[P.boardIndex[j.company]]) || null;
  const PIPELINE = 5; // hires across the recent cohorts that make a "proven" pipeline
  const proven = (j) => (hires(j)?.recent || 0) >= PIPELINE;
  // Cohort "2022-2023" is the class of 2023.
  const recentSpan = P ? `the classes of ${P.recentCohorts[0].slice(5)}–${P.recentCohorts.at(-1).slice(5)}` : "";
  const vtNote = `${school.shortName} pipeline`;
  for (const j of JOBS) j.majors = Object.keys(hires(j)?.byMajor || {});

  $("#hero-lede").textContent = `Pulled straight from ${data.companies} companies' own career sites every hour, so you see roles the hour they post, not days later on LinkedIn or Handshake. Internships, co-ops and new-grad only.`;
  $("#hero-proof").innerHTML = `<b>${fmt(JOBS.length)}</b> open roles · <b>${companyCount}</b> companies hiring · <b>${fmt(JOBS.filter((j) => j.minutesAgo < 1440).length)}</b> new today${P ? ` · <b>${fmt(P.placed)}</b> ${esc(school.demonym.replace(/s$/, ""))} placements tracked` : ""}`;
  $("#updated").textContent = `Updated ${ago(Math.round((now - Date.parse(data.generatedAt)) / 60000)).toLowerCase()}`;
  $("#foot-note").textContent = `Data refreshed ${new Date(data.generatedAt).toLocaleString()}`;

  // Filters -----------------------------------------------------------

  const countBy = (k) => {
    const m = new Map();
    for (const j of JOBS) for (const v of [].concat(j[k] ?? [])) if (v) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  };
  const STATE_NAMES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington, DC", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };

  const posted = [["1", "Last 24 hrs (fresh roles)"], ["3", "Last 3 days"], ["7", "Last 7 days"], ["all", "All open roles"]];
  const groups = [
    { key: "level", label: "Level", options: ["Internship", "Co-op", "New grad"] },
    { key: "fn", label: "Function", options: countBy("fn") },
    { key: "sector", label: "Industry", options: countBy("sector") },
    { key: "arrangement", label: "Work arrangement", options: ["On-site", "Hybrid", "Remote", "Remote OK"] },
    { key: "states", label: "Location", options: countBy("states"), name: (v) => STATE_NAMES[v] || v },
    { key: "term", label: "Start", options: countBy("term").filter((t) => /20(2[6-9])/.test(t)).sort() },
    // Majors VT actually placed at board companies, most common first.
    ...(P ? [{ key: "majors", label: `Hires my major`, options: countBy("majors").filter((m) => m && JOBS.some((j) => (hires(j)?.byMajor[m] || 0) >= 2)), one: true }] : []),
    { key: "company", label: "Company", options: countBy("company").sort((a, b) => a.localeCompare(b)), one: true },
  ];
  const flags = [
    ...(P ? [["vtOnly", `Proven ${vtNote}`, `Hired ${PIPELINE}+ ${school.demonym} from ${recentSpan}, per VT's placement report`]] : []),
    ["payOnly", "Pay listed", "Only roles that post a salary or hourly rate"],
    ["titleOnly", "Clearly early-career", "Hide roles we matched from the posting text, not the title"],
  ];
  const label = (g, v) => (g.name ? g.name(v) : v);

  const blank = () => ({ q: "", posted: "1", ...Object.fromEntries(flags.map(([k]) => [k, false])), ...Object.fromEntries(groups.map((g) => [g.key, new Set()])) });
  let state = blank();
  // Few roles in the last day (a quiet hour, a fresh install): open wider.
  if (JOBS.filter((j) => j.minutesAgo < 1440).length < 15) state.posted = "7";
  let draft = null;
  let shown = PAGE;

  function matches(j, s) {
    if (s.posted !== "all" && j.minutesAgo > Number(s.posted) * 1440) return false;
    if (s.vtOnly && !proven(j)) return false;
    if (s.payOnly && !j.pay) return false;
    if (s.titleOnly && j.fromPosting) return false;
    for (const g of groups) {
      const want = s[g.key];
      if (want.size && ![].concat(j[g.key] ?? []).some((v) => want.has(v))) return false;
    }
    if (s.q) {
      const hay = `${j.title} ${j.company} ${j.location} ${j.sector} ${j.fn} ${j.level} ${j.term || ""} ${j.states.map((x) => STATE_NAMES[x] || x).join(" ")}`.toLowerCase();
      if (!s.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  // Board -------------------------------------------------------------

  function ago(m) {
    if (m < 2) return "Just now";
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    const d = Math.floor(m / 1440);
    return d === 1 ? "Yesterday" : `${d}d ago`;
  }

  // Workday only says "Posted Today" / "N Days Ago": don't fake minutes.
  const when = (j) => (j.postedApprox && j.minutesAgo >= 60 ? (j.minutesAgo < 1440 ? "Today" : ago(j.minutesAgo)) : ago(j.minutesAgo));

  function logo(j, cls = "") {
    const bg = `hsl(${hue(j.company)} 45% 32%)`;
    return `<span class="logo ${cls}" style="background:${bg}"><span>${esc(initials(j.company))}</span><img src="https://www.google.com/s2/favicons?domain=${esc(j.domain)}&sz=128" alt="" loading="lazy" onload="this.naturalWidth>16?this.parentNode.classList.add('has-img'):this.remove()" onerror="this.remove()" /></span>`;
  }

  function hiredBadge(j) {
    const h = hires(j);
    if (!h || h.n < 2) return "";
    return `<span class="recruits ${proven(j) ? "" : "dim"}" title="${esc(school.demonym)} hired: ${h.recent} in ${recentSpan}, ${h.n} since the class of ${P.cohorts[0].slice(5)}">${fmt(h.n)} hired</span>`;
  }

  function rowHtml(j, i) {
    return `<div class="row job" role="row" data-id="${esc(j.id)}" style="animation-delay:${Math.min(i, 12) * 16}ms">
      <div class="role">
        ${logo(j)}
        <div class="role-text">
          <div class="role-title">${esc(j.title)}</div>
          <div class="role-co">${esc(j.company)}${hiredBadge(j)}</div>
        </div>
      </div>
      <div class="meta">
        <div class="loc">${esc(j.location)}<small>${esc(j.arrangement)} · ${esc(j.fn)}</small></div>
        <div class="when ${j.minutesAgo < 1440 ? "fresh" : ""}" title="${esc(new Date(j.postedAt).toLocaleString())}${j.postedApprox ? " (approx.)" : ""}">${when(j)}</div>
        <div class="pay">${j.pay ? esc(j.pay) : '<span class="none">—</span>'}</div>
        <div><span class="lvl lvl-${j.level.replace(/\W/g, "").toLowerCase()}">${esc(j.level)}</span></div>
      </div>
      <a class="apply" href="${esc(j.url)}" target="_blank" rel="noopener" aria-label="Apply to ${esc(j.title)} at ${esc(j.company)}">${icon.out}</a>
    </div>`;
  }

  function render() {
    const list = JOBS.filter((j) => matches(j, state));
    $("#rows").innerHTML = list.slice(0, shown).map(rowHtml).join("");
    $("#empty").hidden = list.length > 0;
    $("#more").hidden = list.length <= shown;
    $("#more").textContent = `Load more roles (${fmt(list.length - shown)} left)`;
    const fresh = list.filter((j) => j.minutesAgo < 1440).length;
    $("#tally").innerHTML = state.posted === "1"
      ? `${fmt(list.length)} fresh roles in the last 24 hrs ✦ <span>${fmt(list.filter(proven).length)} at proven ${esc(vtNote)} employers</span>`
      : `${fmt(list.length)} roles ✦ <span>${fmt(fresh)} posted today</span>`;
    renderChips();
  }

  function activeCount(s = state) {
    return groups.reduce((n, g) => n + s[g.key].size, 0) + flags.filter(([k]) => s[k]).length + (s.posted !== "1" ? 1 : 0);
  }

  function renderChips() {
    const chips = [];
    chips.push([posted.find((p) => p[0] === state.posted)[1], () => (state.posted = state.posted === "1" ? "all" : "1")]);
    for (const [k, name] of flags) if (state[k]) chips.push([name, () => (state[k] = false)]);
    for (const g of groups) for (const v of state[g.key]) chips.push([label(g, v), () => state[g.key].delete(v)]);

    const box = $("#active-chips");
    box.innerHTML = chips.map(([t], i) => `<span class="chip">${esc(t)}<button data-chip="${i}" aria-label="Remove ${esc(t)}">${icon.x}</button></span>`).join("");
    box.querySelectorAll("[data-chip]").forEach((b) => b.addEventListener("click", () => { chips[b.dataset.chip][1](); shown = PAGE; render(); }));

    const n = activeCount();
    $("#filter-count").hidden = !n;
    $("#filter-count").textContent = n;
  }

  // Filter drawer -----------------------------------------------------

  function renderFilters() {
    const d = draft;
    const section = (title, hint, body, open) =>
      `<details class="section" ${open ? "open" : ""}><summary>${esc(title)}<span class="hint">${esc(hint)}</span>${icon.caret}</summary>${body}</details>`;

    let html = section("Posted within", "",
      `<div class="options">${posted.map(([v, t]) => `<label class="opt"><input type="radio" name="posted" value="${v}" ${d.posted === v ? "checked" : ""}/>${esc(t)}</label>`).join("")}</div>`, true);
    html += section("Shortcuts", flags.some(([k]) => d[k]) ? "On" : "",
      `<div class="options one">${flags.map(([k, name, sub]) => `<label class="opt toggle"><span>${esc(name)}<small>${esc(sub)}</small></span><input type="checkbox" data-flag="${k}" ${d[k] ? "checked" : ""}/></label>`).join("")}</div>`, true);
    for (const g of groups) {
      const set = d[g.key];
      html += section(g.label, set.size ? `${set.size} selected` : "",
        `<div class="options ${g.one ? "one" : ""}">${g.options.map((o) => `<label class="opt"><input type="checkbox" data-group="${g.key}" value="${esc(o)}" ${set.has(o) ? "checked" : ""}/>${esc(label(g, o))}</label>`).join("")}</div>`,
        set.size > 0 || g.key === "level");
    }
    $("#filter-body").innerHTML = html;
  }

  const showCount = () => ($("#apply").textContent = `Show ${fmt(JOBS.filter((j) => matches(j, draft)).length)} roles`);

  $("#filter-body").addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "posted") draft.posted = t.value;
    else if (t.dataset.flag) draft[t.dataset.flag] = t.checked;
    else if (t.dataset.group) {
      draft[t.dataset.group][t.checked ? "add" : "delete"](t.value);
      const n = draft[t.dataset.group].size;
      t.closest("details").querySelector(".hint").textContent = n ? `${n} selected` : "";
    }
    showCount();
  });

  const clone = (s) => ({ ...s, ...Object.fromEntries(groups.map((g) => [g.key, new Set(s[g.key])])) });

  $("#open-filters").addEventListener("click", () => { draft = clone(state); renderFilters(); showCount(); open("#filters"); });
  $("#apply").addEventListener("click", () => { state = draft; shown = PAGE; close(); render(); });
  $("#reset").addEventListener("click", () => { draft = { ...blank(), q: state.q }; renderFilters(); showCount(); });
  $("#reset-empty").addEventListener("click", () => { state = { ...blank(), posted: "all" }; $("#q").value = ""; shown = PAGE; render(); });

  // Role detail -------------------------------------------------------

  function openDetail(j) {
    const facts = [
      j.location, j.arrangement, j.level, j.term && `Starts ${j.term}`, j.pay,
      `Posted ${when(j).toLowerCase()}`,
    ].filter(Boolean);
    const why = j.fromPosting
      ? `The title doesn't say early-career; we kept it because the posting asks for ${j.yearsMin != null ? `${j.yearsMin === 0 ? "no" : `${j.yearsMin}+ year${j.yearsMin === 1 ? "" : "s"} of`} prior experience` : "new or recent grads"}.`
      : `${j.level} in the title.${j.yearsMin != null ? ` Posting asks for ${j.yearsMin}+ years of experience.` : ""}`;

    $("#detail-apply").href = j.url;
    $("#detail-body").innerHTML = `
      <div class="d-top">
        ${logo(j, "lg")}
        <div><h2>${esc(j.title)}</h2><p>${esc(j.company)} · ${esc(j.sector)} · ${esc(j.fn)}</p></div>
      </div>
      <div class="pills">
        ${facts.map((f) => `<span class="pill">${esc(f)}</span>`).join("")}
        ${proven(j) ? `<span class="pill gold">Proven ${esc(vtNote)}</span>` : ""}
      </div>
      <div class="panel">
        <h3>Why it's here</h3>
        <p>${esc(why)}</p>
      </div>
      <div class="panel">
        <h3>Source</h3>
        <p>Pulled from ${esc(j.company)}'s own ${esc(ATS[j.ats] || "careers")} board, first seen ${esc(new Date(j.firstSeenAt).toLocaleString())}. Apply goes straight to the employer.</p>
        <a class="btn sm" href="${esc(j.url)}" target="_blank" rel="noopener">Open the posting ${icon.out}</a>
      </div>
      ${hiredPanel(j)}`;
    open("#detail");
  }

  function hiredPanel(j) {
    const h = hires(j);
    const since = P ? `the class of ${P.cohorts[0].slice(5)}` : "";
    if (!h) return P ? `<div class="panel"><h3>${esc(school.demonym)} hired at ${esc(j.company)}</h3><p>No ${esc(school.shortName)} grads reported landing here since ${since}. Could be a new door.</p></div>` : "";
    const bars = P.cohorts.map((c) => h.byCohort[c] || 0);
    const peak = Math.max(...bars, 1);
    const majors = Object.entries(h.byMajor).slice(0, 8);
    return `<div class="panel">
        <h3>${esc(school.demonym)} hired at ${esc(j.company)}</h3>
        <p>${fmt(h.n)} ${esc(school.shortName)} grads since ${since}, ${fmt(h.recent)} of them from ${recentSpan}.</p>
        <div class="spark" aria-label="Hires per graduating class">${P.cohorts.map((c, i) => `<span style="height:${Math.max(4, (bars[i] / peak) * 100)}%" title="Class of ${c.slice(5)}: ${bars[i]}"></span>`).join("")}</div>
        <div class="spark-axis"><span>${P.cohorts[0].slice(5)}</span><span>${P.cohorts.at(-1).slice(5)}</span></div>
        <h4>Majors they came from</h4>
        <div class="fit">${majors.map(([m, n]) => `<span class="pill">${esc(m)} <b>${n}</b></span>`).join("")}</div>
        <h4>Titles they started in</h4>
        <ul class="titles">${h.titles.slice(0, 6).map(([t, n]) => `<li><span>${esc(t)}</span><b>${n}</b></li>`).join("")}</ul>
        ${h.places.length ? `<h4>Where</h4><p class="places">${h.places.slice(0, 4).map(([p, n]) => `${esc(p)} (${n})`).join(" · ")}</p>` : ""}
        <p class="src">From <a href="${esc(P.sourceUrl)}" target="_blank" rel="noopener">${esc(school.shortName)}'s First Destination Report</a>: graduates' self-reported first jobs.</p>
      </div>`;
  }

  // Overlays ----------------------------------------------------------

  let current = null;
  function open(sel) {
    close();
    current = $(sel);
    current.hidden = false;
    $("#scrim").hidden = false;
  }
  function close() {
    if (current) current.hidden = true;
    $("#scrim").hidden = true;
    current = null;
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    if (e.target.closest("[data-close]") || e.target === $("#scrim")) { close(); return; }
    const row = e.target.closest(".row.job");
    if (row) openDetail(JOBS.find((j) => j.id === row.dataset.id));
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  let qTimer;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      // Searching for something specific: don't hide it behind "last 24 hrs".
      if (state.q && state.posted === "1") state.posted = "all";
      shown = PAGE;
      render();
    }, 120);
  });
  $("#more").addEventListener("click", () => { shown += PAGE; render(); });

  render();
})();
