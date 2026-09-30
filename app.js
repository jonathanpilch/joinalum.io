/* Alum -- the explore board. One school per page (?school=slug, default vt);
 * everything school-specific comes from SCHOOLS, every role from JOBS. */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const params = new URLSearchParams(location.search);
  const school = SCHOOLS[params.get("school")] || SCHOOLS.vt;
  const recruiters = new Set(school.recruiters);
  const PAGE = 25;

  const icon = {
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    out: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    caret: '<svg class="caret" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const initials = (name) => name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("") || name[0];
  const fmt = (n) => n.toLocaleString("en-US");

  // School identity ---------------------------------------------------

  document.documentElement.style.setProperty("--backdrop-image", `url("${school.backdrop}")`);
  document.title = `Alum · ${school.name}`;
  $("#school-mark").src = school.mark;
  $("#school-name").textContent = school.name;
  $("#hero-eyebrow").textContent = `For ${school.demonym}, from ${school.demonym}`;
  $("#hero-title").innerHTML = `Apply where ${esc(school.demonym)}<br />already work.`;
  $("#hero-lede").textContent = `Fresh internships and early career roles at the employers that recruit at ${school.shortName}, with the alumni already on the team. Updated hourly, matched to your resume.`;
  $("#hero-proof").innerHTML = `<b>${fmt(school.alumni)}+</b> ${esc(school.demonym)} in the network · <b>${school.recruiters.length}</b> employers recruiting on campus`;
  $("#alumni-col").textContent = school.demonym;
  $("#signin-mark").src = school.mark;
  $("#signin-title").textContent = "See your match scores";
  $("#signin-lede").textContent = `Sign in with your ${school.domain} address. We'll score every role against your resume and major.`;
  $("#signin-email").placeholder = `you@${school.domain}`;

  // Filters -----------------------------------------------------------

  const posted = [["1", "Last 24 hrs (fresh roles)"], ["7", "Last 7 days"], ["14", "Last 14 days"], ["all", "All time"]];
  const groups = [
    { key: "type", label: "Role type", options: ["Internship", "Co-op", "Full-time"] },
    { key: "arrangement", label: "Work arrangement", options: ["On-site", "Hybrid", "Remote"] },
    { key: "fn", label: "Function", options: [...new Set(JOBS.map((j) => j.fn))].sort() },
    { key: "majors", label: "Major", options: school.majors, one: true },
    { key: "classYears", label: "Class year", options: ["2026", "2027", "2028", "2029"] },
    { key: "state", label: "Location", options: [...new Set(JOBS.map((j) => stateOf(j.location)))].sort() },
  ];
  function stateOf(loc) { return loc === "Remote" ? "Remote" : loc.split(", ").pop(); }

  const blank = () => ({ q: "", posted: "1", recruitsOnly: false, alumsOnly: false, ...Object.fromEntries(groups.map((g) => [g.key, new Set()])) });
  let state = blank();
  let draft = null;
  let shown = PAGE;

  function matches(j, s) {
    if (s.posted !== "all" && j.minutesAgo > Number(s.posted) * 1440) return false;
    if (s.recruitsOnly && !recruiters.has(j.company)) return false;
    if (s.alumsOnly && !j.onTeam) return false;
    for (const g of groups) {
      const want = s[g.key];
      if (!want.size) continue;
      const have = g.key === "state" ? [stateOf(j.location)] : [].concat(j[g.key]);
      if (!have.some((v) => want.has(v))) return false;
    }
    if (s.q) {
      const hay = `${j.title} ${j.company} ${j.location} ${j.industry} ${j.fn}`.toLowerCase();
      if (!s.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  // Board -------------------------------------------------------------

  function ago(m) {
    if (m < 5) return "Just now";
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    const d = Math.floor(m / 1440);
    return d === 1 ? "Yesterday" : `${d}d ago`;
  }

  function faces(list) {
    return `<span class="faces">${list.slice(0, 3).map((a) => `<span class="face">${esc(initials(a.name))}</span>`).join("")}</span>`;
  }

  function rowHtml(j, i) {
    const alums = j.onTeam
      ? `${faces(j.alumni)}<span class="n">${j.onTeam}</span>`
      : `<span class="none">None yet</span>`;
    return `<div class="row job" role="row" data-id="${j.id}" style="animation-delay:${Math.min(i, 12) * 18}ms">
      <div class="role">
        <span class="logo" style="background:${j.color}">${esc(initials(j.company))}</span>
        <div class="role-text">
          <div class="role-title">${esc(j.title)}</div>
          <div class="role-co">${esc(j.company)}${recruiters.has(j.company) ? `<span class="recruits">Recruits at ${esc(school.shortName)}</span>` : ""}</div>
        </div>
      </div>
      <div class="meta">
        <div class="loc">${esc(j.location)}<small>${esc(j.arrangement)} · ${esc(j.type)}</small></div>
        <div class="when ${j.minutesAgo < 1440 ? "fresh" : ""}">${ago(j.minutesAgo)}</div>
        <div class="alums" title="${j.onTeam} ${esc(school.demonym)} on this team">${alums}</div>
        <div><button class="score" data-signin>Get score</button></div>
      </div>
      <a class="apply" href="#" data-apply aria-label="Apply to ${esc(j.title)} at ${esc(j.company)}">${icon.out}</a>
    </div>`;
  }

  function render() {
    const list = JOBS.filter((j) => matches(j, state));
    $("#rows").innerHTML = list.slice(0, shown).map(rowHtml).join("");
    $("#empty").hidden = list.length > 0;
    $("#more").hidden = list.length <= shown;

    const fresh = JOBS.filter((j) => j.minutesAgo < 1440).length;
    const withAlums = list.filter((j) => j.onTeam).length;
    $("#tally").innerHTML = state.posted === "1" && !activeCount()
      ? `${fresh} fresh roles added today ✦ <span>${withAlums} with ${esc(school.demonym)} on the team</span>`
      : `${list.length} roles ✦ <span>${withAlums} with ${esc(school.demonym)} on the team</span>`;

    renderChips();
  }

  function activeCount(s = state) {
    return groups.reduce((n, g) => n + s[g.key].size, 0) + (s.recruitsOnly ? 1 : 0) + (s.alumsOnly ? 1 : 0) + (s.posted !== "1" ? 1 : 0);
  }

  function renderChips() {
    const chips = [];
    const label = posted.find((p) => p[0] === state.posted)[1];
    chips.push([label, () => (state.posted = state.posted === "1" ? "all" : "1")]);
    if (state.recruitsOnly) chips.push([`Recruits at ${school.shortName}`, () => (state.recruitsOnly = false)]);
    if (state.alumsOnly) chips.push([`${school.demonym} on the team`, () => (state.alumsOnly = false)]);
    for (const g of groups) for (const v of state[g.key]) chips.push([v, () => state[g.key].delete(v)]);

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
    const section = (label, hint, body, open) =>
      `<details class="section" ${open ? "open" : ""}><summary>${esc(label)}<span class="hint">${esc(hint)}</span>${icon.caret}</summary>${body}</details>`;

    let html = section(
      "Posted within", "",
      `<div class="options">${posted.map(([v, t]) => `<label class="opt"><input type="radio" name="posted" value="${v}" ${d.posted === v ? "checked" : ""}/>${esc(t)}</label>`).join("")}</div>`,
      true,
    );
    html += section(
      `${school.shortName} network`, (d.recruitsOnly || d.alumsOnly) ? "On" : "",
      `<div class="options one">
        <label class="opt toggle"><span>Recruits at ${esc(school.shortName)}<small>Employers at ${esc(school.name)} career fairs</small></span><input type="checkbox" data-flag="recruitsOnly" ${d.recruitsOnly ? "checked" : ""}/></label>
        <label class="opt toggle"><span>${esc(school.demonym)} on the team<small>At least one alum works on this team</small></span><input type="checkbox" data-flag="alumsOnly" ${d.alumsOnly ? "checked" : ""}/></label>
      </div>`,
      true,
    );
    for (const g of groups) {
      const set = d[g.key];
      html += section(
        g.label, set.size ? `${set.size} selected` : "",
        `<div class="options ${g.one ? "one" : ""}">${g.options.map((o) => `<label class="opt"><input type="checkbox" data-group="${g.key}" value="${esc(o)}" ${set.has(o) ? "checked" : ""}/>${esc(o)}</label>`).join("")}</div>`,
        set.size > 0,
      );
    }
    $("#filter-body").innerHTML = html;
  }

  $("#filter-body").addEventListener("change", (e) => {
    const t = e.target;
    if (t.name === "posted") draft.posted = t.value;
    else if (t.dataset.flag) draft[t.dataset.flag] = t.checked;
    else if (t.dataset.group) draft[t.dataset.group][t.checked ? "add" : "delete"](t.value);
    const hint = t.closest("details").querySelector(".hint");
    if (t.dataset.group && hint) hint.textContent = draft[t.dataset.group].size ? `${draft[t.dataset.group].size} selected` : "";
    $("#apply").textContent = `Show ${JOBS.filter((j) => matches(j, draft)).length} roles`;
  });

  function clone(s) {
    return { ...s, ...Object.fromEntries(groups.map((g) => [g.key, new Set(s[g.key])])) };
  }

  function openFilters() {
    draft = clone(state);
    renderFilters();
    $("#apply").textContent = `Show ${JOBS.filter((j) => matches(j, draft)).length} roles`;
    open("#filters");
  }

  $("#open-filters").addEventListener("click", openFilters);
  $("#apply").addEventListener("click", () => { state = draft; shown = PAGE; close(); render(); });
  $("#reset").addEventListener("click", () => { draft = { ...blank(), q: state.q }; renderFilters(); $("#apply").textContent = `Show ${JOBS.filter((j) => matches(j, draft)).length} roles`; });
  $("#reset-empty").addEventListener("click", () => { state = blank(); $("#q").value = ""; shown = PAGE; render(); });

  // Role detail -------------------------------------------------------

  function openDetail(j) {
    const people = j.alumni.length
      ? j.alumni.map((a) => `<div class="person"><span class="face">${esc(initials(a.name))}</span>
          <div class="who"><b>${esc(a.name)} '${String(a.year).slice(2)}</b><span>${esc(a.title)} · ${esc(a.major)}</span></div>
          <button class="btn soft sm" data-signin>Ask for referral</button></div>`).join("")
      : `<p>No ${esc(school.demonym)} on this team yet. ${fmt(j.alumniTotal)} work elsewhere at ${esc(j.company)}.</p>`;

    $("#detail-body").innerHTML = `
      <div class="d-top">
        <span class="logo lg" style="background:${j.color}">${esc(initials(j.company))}</span>
        <div><h2>${esc(j.title)}</h2><p>${esc(j.company)} · ${esc(j.industry)}</p></div>
      </div>
      <div class="pills">
        <span class="pill">${esc(j.location)}</span>
        <span class="pill">${esc(j.arrangement)}</span>
        <span class="pill">${esc(j.type)}</span>
        <span class="pill">${esc(j.pay)}</span>
        <span class="pill">Posted ${ago(j.minutesAgo).toLowerCase()}</span>
        ${recruiters.has(j.company) ? `<span class="pill gold">Recruits at ${esc(school.shortName)}</span>` : ""}
      </div>
      <div class="panel">
        <h3>${esc(school.demonym)} at ${esc(j.company)}</h3>
        <p>${j.onTeam} on this team · ${fmt(j.alumniTotal)} across the company</p>
        ${people}
      </div>
      <div class="panel">
        <h3>Who it fits</h3>
        <p>Majors and class years the posting targets.</p>
        <div class="fit">${j.majors.map((m) => `<span class="pill">${esc(m)}</span>`).join("")}${j.classYears.map((y) => `<span class="pill">Class of ${y}</span>`).join("")}</div>
      </div>
      <div class="panel">
        <h3>Your match</h3>
        <p>Sign in with your ${esc(school.domain)} address to score this role against your resume.</p>
        <button class="btn sm" data-signin>Get match score</button>
      </div>`;
    open("#detail");
  }

  // Overlays ----------------------------------------------------------

  let current = null;
  function open(sel) {
    close();
    current = $(sel);
    current.hidden = false;
    if (current.classList.contains("drawer")) $("#scrim").hidden = false;
  }
  function close() {
    if (current) current.hidden = true;
    $("#scrim").hidden = true;
    current = null;
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-signin]")) { e.stopPropagation(); open("#signin"); $("#signin-email").focus(); return; }
    if (e.target.closest("[data-apply]") || e.target.closest("#detail-apply")) { e.preventDefault(); e.stopPropagation(); toast("Apply links go to the employer's posting (not wired up in the demo)"); return; }
    if (e.target.closest("[data-close]") || e.target === $("#scrim") || e.target === $("#signin")) { close(); return; }
    const row = e.target.closest(".row.job");
    if (row) openDetail(JOBS.find((j) => j.id === row.dataset.id));
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  $("#signin-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#signin-email").value.trim().toLowerCase();
    if (!v.endsWith("@" + school.domain)) { toast(`Use your ${school.domain} address`); return; }
    close();
    toast("Sign-in isn't wired up in the demo yet");
  });

  let qTimer;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = e.target.value.trim(); shown = PAGE; render(); }, 120);
  });
  $("#more").addEventListener("click", () => { shown += PAGE; render(); });

  render();
})();
