/* Sign-in and sync. A student signs in with their school email (a magic
 * link; the database refuses any other domain), and their profile, tracker
 * and radars follow them across devices. Interview notes and resume parsing
 * need an account; everything else works signed out, on this device.
 *
 * Configured by config.js (window.ALUM_CONFIG, written from .env by
 * scripts/config.mjs). Without it, `account.enabled` is false and the page
 * never loads Supabase. */

const cfg = window.ALUM_CONFIG || {};
const SUPABASE = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

let sb = null;
let user = null;

// The page's profile <-> the profiles row.
const toRow = (p) => ({
  name: p.name, major: p.major, grad_year: p.year ? Number(p.year) : null, term: p.term, degree: p.degree,
  work: p.work, gpa: p.gpa ? Number(p.gpa) : null, skills: p.skills, interests: p.interests, places: p.places,
  updated_at: new Date().toISOString(),
});
const fromRow = (r) => ({
  name: r.name, major: r.major, year: r.grad_year ? String(r.grad_year) : "", term: r.term, degree: r.degree,
  work: r.work, gpa: r.gpa != null ? String(r.gpa) : "", skills: r.skills, interests: r.interests, places: r.places,
});
// Has the student ever filled anything in? An untouched row is just the
// trigger's placeholder, and shouldn't overwrite what's on this device.
const filled = (r) => !!(r.name || r.major || r.grad_year || r.work || r.gpa != null || r.skills?.length || r.interests?.length || r.places?.length);

const savedRow = (id, s) => ({
  job_id: id, status: s.status, job: s.job, deadline: s.deadline || null, remind_on: s.remindOn || null,
  notes: s.notes || "", history: s.history || [], created_at: new Date(s.at || Date.now()).toISOString(),
});
const savedFromRow = (r) => ({
  status: r.status, job: r.job, deadline: r.deadline, remindOn: r.remind_on, notes: r.notes, history: r.history,
  at: Date.parse(r.created_at), updatedAt: Date.parse(r.updated_at),
});

let profileTimer;
const fail = (where) => (e) => { console.warn(`alum: ${where}`, e); throw e; };
const check = ({ data, error }) => { if (error) throw error; return data; };

export const account = {
  enabled: !!(cfg.supabaseUrl && cfg.supabaseKey),
  get user() { return user; },

  async init(onChange) {
    if (!this.enabled) return null;
    const { createClient } = await import(SUPABASE);
    sb = createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    sb.auth.onAuthStateChange((_event, session) => {
      const next = session?.user || null;
      if (next?.id !== user?.id) { user = next; onChange(user); }
    });
    return user;
  },

  async signIn(email) {
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + "#profile" } });
    if (error) throw error;
  },
  // The code from the same email (6–10 digits, per the project's OTP setting). School mail scanners (Microsoft
  // 365 Safe Links) open every link to check it, which spends a one-time
  // link before the student sees it; a typed code can't be spent that way.
  async verifyCode(email, token) {
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw error;
  },
  signOut: () => sb.auth.signOut(),

  /* Everything this account has, merged with what's on this device: the
   * device's newer saves and radars are pushed up, the account's come down. */
  async sync(local) {
    const [prof, savedRows, radarRows] = await Promise.all([
      sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle().then(check),
      sb.from("saved").select("*").then(check),
      sb.from("radars").select("*").order("created_at").then(check),
    ]);

    let profile = local.profile;
    if (prof && filled(prof)) profile = { ...local.profile, ...fromRow(prof) };
    else await this.saveProfile(local.profile, true);

    const saved = {};
    for (const r of savedRows) saved[r.job_id] = savedFromRow(r);
    const up = Object.entries(local.saved).filter(([id, s]) => !saved[id] || (s.updatedAt || s.at) > saved[id].updatedAt);
    if (up.length) await sb.from("saved").upsert(up.map(([id, s]) => savedRow(id, s))).then(check);
    for (const [id, s] of up) saved[id] = s;

    // Radars made signed-out move into the account once.
    const fresh = local.radars.filter((r) => !r.remote);
    let radars = radarRows;
    if (fresh.length) {
      const made = await sb.from("radars").insert(fresh.map(({ name, search, cadence, last_seen_at }) => ({ name, search, cadence, last_seen_at }))).select().then(check);
      radars = [...radarRows, ...made];
    }
    return { profile, saved, radars: radars.map((r) => ({ ...r, remote: true })) };
  },

  saveProfile(p, now = false) {
    if (!user) return;
    clearTimeout(profileTimer);
    const go = () => sb.from("profiles").update(toRow(p)).eq("user_id", user.id).then(check).catch(fail("profile"));
    if (now) return go();
    profileTimer = setTimeout(go, 600);
  },

  putSaved(id, s) { if (user) return sb.from("saved").upsert(savedRow(id, s)).then(check).catch(fail("saved")); },
  dropSaved(id) { if (user) return sb.from("saved").delete().eq("job_id", id).then(check).catch(fail("saved")); },

  addRadar: (r) => sb.from("radars").insert({ name: r.name, search: r.search, cadence: r.cadence }).select().single().then(check).then((x) => ({ ...x, remote: true })),
  updateRadar: (id, patch) => sb.from("radars").update(patch).eq("id", id).then(check).catch(fail("radar")),
  dropRadar: (id) => sb.from("radars").delete().eq("id", id).then(check).catch(fail("radar")),

  // Interview notes, by company. Authors are never returned.
  reports: (company) => sb.from("interview_reports")
    .select("id, company, job_title, term, stage, outcome, difficulty, weeks, questions, tips, created_at")
    .ilike("company", company.replace(/[%_\\]/g, "\\$&")).order("created_at", { ascending: false }).limit(50).then(check),
  myReports: () => sb.rpc("my_report_ids").then(check),
  addReport: (r) => sb.from("interview_reports").insert(r).then(check),
  dropReport: (id) => sb.from("interview_reports").delete().eq("id", id).then(check),

  /* A resume PDF -> suggested profile fields, read by Claude in the
   * parse-resume function. The file isn't stored anywhere. */
  async parseResume(file, vocab) {
    const b64 = await new Promise((ok, no) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = () => no(r.error);
      r.readAsDataURL(file);
    });
    const { data, error } = await sb.functions.invoke("parse-resume", { body: { pdf: b64, ...vocab } });
    if (error) {
      const msg = await error.context?.json?.().then((x) => x.error).catch(() => null);
      throw new Error(msg || error.message);
    }
    return data;
  },
};
