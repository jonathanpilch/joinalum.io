/* Radar alerts and tracker reminders, by email. Runs after each ingest:
 *
 *   node ingest/notify.mjs            send what's due
 *   node ingest/notify.mjs --dry      print what would go out, send nothing
 *
 * A radar is a saved search (lib/core.js decides matches, exactly as the
 * page does, including hiding roles the student can't apply to). Each run
 * sends postings Alum first saw since the radar's last email, never one
 * it already sent. "instant" radars go every run, "daily" and "weekly" when
 * due (the due_radars() function decides). Reminders go on the date the
 * student set on a saved internship.
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, and
 * optionally ALUM_FROM and SITE_URL. Skips quietly when they're missing. */

import { readFile } from "node:fs/promises";
import * as core from "../lib/core.js";

const ROOT = new URL("../", import.meta.url);
const DRY = process.argv.includes("--dry");
const MAX_PER_EMAIL = 15;
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY } = process.env;
const FROM = process.env.ALUM_FROM || "Alum <alerts@joinalum.io>";
const SITE = (process.env.SITE_URL || "https://joinalum.io").replace(/\/$/, "");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || (!RESEND_API_KEY && !DRY)) {
  console.log("notify: no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY; skipping");
  process.exit(0);
}

const readJson = async (p, d) => { try { return JSON.parse(await readFile(new URL(p, ROOT), "utf8")); } catch { return d; } };
const data = await readJson("data/jobs.json", { jobs: [] });
const P = await readJson("data/placements.json", null);
const schools = Object.fromEntries([...(await readFile(new URL("schools.js", ROOT), "utf8")).matchAll(/(\w+):\s*{[^}]*?demonym:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
const JOBS = data.jobs.filter((j) => core.LEVELS.includes(j.level));
const now = Date.now();

// New-style keys (sb_secret_...) go in `apikey` only; Supabase rejects them
// as a Bearer token. Legacy service_role keys are JWTs and go in both.
const authHeaders = SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")
  ? { apikey: SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
  : { apikey: SUPABASE_SERVICE_ROLE_KEY };

async function rpc(fn, args = {}) {
  const r = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`${fn}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status === 204 ? null : r.json();
}

async function send(to, subject, html, text) {
  if (DRY) { console.log(`\n--- to ${to}: ${subject}\n${text}`); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text, headers: { "List-Unsubscribe": `<${SITE}/#radars>` } }),
  });
  if (!r.ok) throw new Error(`resend: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

// Profiles come back as database rows; the matcher wants the page's shape.
const asProfile = (r) => ({
  ...core.PROFILE,
  ...(r && {
    major: r.major, year: r.grad_year ? String(r.grad_year) : "", term: r.term, degree: r.degree, work: r.work,
    gpa: r.gpa != null ? String(r.gpa) : "", skills: r.skills || [], interests: r.interests || [], places: r.places || [],
  }),
});

const esc = core.esc;
const shell = (title, body, footer) => `<!doctype html><html><body style="margin:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  <div style="font-weight:800;font-size:20px;margin-bottom:18px">alum</div>
  <div style="background:#fff;border:1px solid #ebebeb;border-radius:16px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>${body}
  </div>
  <p style="font-size:12px;color:#6a6a6a;margin:16px 4px">${footer}</p>
</div></body></html>`;

function jobRow(j, profile, demonym) {
  const h = core.hiresOf(P, j);
  const mine = h && profile.major ? h.byMajor[profile.major] : 0;
  const hokies = h ? `${h.n} ${demonym} hired${mine ? ` · ${mine} from your major` : ""}` : "";
  const meta = [j.location, j.term, j.pay].filter(Boolean).join(" · ");
  return `<a href="${SITE}/?job=${encodeURIComponent(j.id)}" style="display:block;text-decoration:none;color:#222;padding:14px 0;border-top:1px solid #ebebeb">
    <div style="font-size:13px;color:#6a6a6a">${esc(j.company)}</div>
    <div style="font-weight:700;font-size:16px;margin:2px 0">${esc(j.title)}</div>
    <div style="font-size:13px;color:#6a6a6a">${esc(meta)}</div>
    ${hokies ? `<div style="font-size:12px;font-weight:700;color:#6b5418;margin-top:6px">${esc(hokies)}</div>` : ""}
  </a>`;
}

// Radars ---------------------------------------------------------------------

let sentRadars = 0, sentJobs = 0, failures = 0;
for (const r of await rpc("due_radars")) {
  try {
    const profile = asProfile(r.profile);
    const demonym = schools[r.profile?.school] || "alumni";
    const search = { ...r.search, filters: core.filtersFromJSON(r.search?.filters) };
    const since = Date.parse(r.last_sent_at);
    const sent = new Set(r.sent);
    const fresh = JOBS
      .filter((j) => Date.parse(j.firstSeenAt) > since && !sent.has(j.id) && core.matches(j, search, { profile, P, now }))
      .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
    if (fresh.length) {
      const shown = fresh.slice(0, MAX_PER_EMAIL);
      const more = fresh.length - shown.length;
      const subject = `${fresh.length} new: ${r.name}`;
      const body = shown.map((j) => jobRow(j, profile, demonym)).join("") +
        (more ? `<p style="margin:16px 0 0"><a href="${SITE}/?radar=${r.id}" style="color:#222;font-weight:700">See all ${fresh.length} on Alum</a></p>` : "");
      const text = shown.map((j) => `${j.company} — ${j.title}\n${SITE}/?job=${encodeURIComponent(j.id)}`).join("\n\n");
      await send(r.email, subject, shell(esc(`${fresh.length} new in “${r.name}”`), body,
        `You're getting this because of your Alum radar “${esc(r.name)}” (${r.cadence}). <a href="${SITE}/#radars" style="color:#6a6a6a">Change or turn it off</a>.`), text);
      sentRadars++;
      sentJobs += shown.length;
    }
    if (!DRY) await rpc("mark_radar_sent", { radar: r.id, job_ids: fresh.slice(0, MAX_PER_EMAIL).map((j) => j.id) });
  } catch (e) {
    failures++;
    console.error(`radar ${r.id}: ${e.message}`);
  }
}

// Reminders ------------------------------------------------------------------

const byUser = new Map();
for (const row of await rpc("due_reminders")) {
  if (!byUser.has(row.user_id)) byUser.set(row.user_id, { email: row.email, rows: [] });
  byUser.get(row.user_id).rows.push(row);
}
let sentReminders = 0;
for (const [uid, { email, rows }] of byUser) {
  try {
    const body = rows.map((r) => {
      const live = JOBS.find((j) => j.id === r.job_id);
      const due = r.deadline ? ` · due ${new Date(`${r.deadline}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "";
      return `<a href="${live ? `${SITE}/?job=${encodeURIComponent(r.job_id)}` : esc(r.job.url)}" style="display:block;text-decoration:none;color:#222;padding:14px 0;border-top:1px solid #ebebeb">
        <div style="font-size:13px;color:#6a6a6a">${esc(r.job.company)} · ${esc(r.status)}${due}</div>
        <div style="font-weight:700;font-size:16px;margin:2px 0">${esc(r.job.title)}</div>
        ${r.notes ? `<div style="font-size:13px;color:#6a6a6a">${esc(r.notes.slice(0, 300))}</div>` : ""}
      </a>`;
    }).join("");
    const text = rows.map((r) => `${r.job.company} — ${r.job.title} (${r.status})${r.notes ? `\n${r.notes.slice(0, 300)}` : ""}`).join("\n\n");
    await send(email, rows.length === 1 ? `Reminder: ${rows[0].job.company}` : `${rows.length} reminders from Alum`,
      shell("Your reminders", body, `You set these on your saved internships. <a href="${SITE}/#profile" style="color:#6a6a6a">Open your tracker</a>.`), text);
    if (!DRY) await rpc("mark_reminded", { uid, job_ids: rows.map((r) => r.job_id) });
    sentReminders++;
  } catch (e) {
    failures++;
    console.error(`reminders ${uid}: ${e.message}`);
  }
}

console.log(`notify: ${sentRadars} radar emails (${sentJobs} roles), ${sentReminders} reminder emails${failures ? `, ${failures} failed` : ""}${DRY ? " [dry run]" : ""}`);
if (failures) process.exitCode = 1;
