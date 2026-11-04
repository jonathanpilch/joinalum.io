// google-calendar: the tracker on the student's own Google Calendar.
//
// POST with the student's session (supabase-js functions.invoke sends it):
//   { action: "start", redirect_uri, time_zone }  -> { url }   send the browser here
//   { action: "finish", code, state }             -> status    Google sent them back with a code
//   { action: "sync" }                            -> status    make the calendar match the tracker
//   { action: "disconnect" }                      -> { connected: false }
//
// Alum asks Google only for calendar.app.created: it makes one calendar,
// "Alum", and can see and change that calendar and nothing else. It never
// reads the student's own events. Disconnecting removes the Alum calendar
// and revokes the grant.
//
// The OAuth redirect lands back on the page (/app?code=...&state=...), which
// hands the code here; so this function always runs with a session.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (supabase secrets set),
// SITE_URL (optional, default https://joinalum.io). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { eventsFor, googleEvent, hash, SITE, type SavedRow } from "../_shared/calendar.ts";

const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const API = "https://www.googleapis.com/calendar/v3";
const STATE_TTL = 15 * 60e3;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

class Fail extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";

// Only Alum's own pages may receive the code. Google enforces its registered
// list too; this keeps a bad redirect from ever being stored.
const allowedRedirect = (u: string) =>
  u === `${SITE}/app` || /^http:\/\/(localhost|127\.0\.0\.1):\d+\/app$/.test(u);

const zone = (z: unknown) => {
  if (typeof z !== "string" || z.length > 64) return "America/New_York";
  try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return z; } catch { return "America/New_York"; }
};

// Google OAuth ------------------------------------------------------------------------

async function token(params: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

// The id_token came straight from Google over TLS in the exchange, so its
// payload can be read without checking the signature.
const emailFrom = (idToken?: string) => {
  try { return JSON.parse(atob(idToken!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email ?? null; } catch { return null; }
};

type Conn = { user_id: string; refresh_token: string; calendar_id: string | null; time_zone: string; account_email: string | null };

async function accessToken(admin: SupabaseClient, c: Conn) {
  const { ok, data } = await token({ grant_type: "refresh_token", refresh_token: c.refresh_token });
  if (ok) return data.access_token as string;
  if (data.error === "invalid_grant") {
    // They removed Alum in their Google account settings, or the grant expired.
    await admin.from("connections").update({ status: "revoked" }).eq("user_id", c.user_id).eq("provider", "google");
    throw new Fail(409, "Google Calendar was disconnected. Connect it again.");
  }
  console.error("google token", data);
  throw new Fail(502, "Couldn't reach Google. Try again in a minute.");
}

// Google Calendar API -----------------------------------------------------------------

async function g(at: string, method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || `Google ${r.status}`), { status: r.status });
  return data;
}
const gone = (e: unknown) => [404, 410].includes((e as { status?: number }).status ?? 0);

// The Alum calendar, made again if the student deleted it.
async function calendar(admin: SupabaseClient, at: string, c: Conn) {
  if (c.calendar_id) {
    try { await g(at, "GET", `/calendars/${encodeURIComponent(c.calendar_id)}`); return c.calendar_id; } catch (e) { if (!gone(e) && (e as { status?: number }).status !== 403) throw e; }
  }
  const cal = await g(at, "POST", "/calendars", {
    summary: "Alum",
    description: `Deadlines, reminders and interviews from your Alum tracker. Alum keeps this calendar up to date; change them in Alum: ${SITE}/app#profile`,
    timeZone: c.time_zone,
  });
  // A new calendar means none of the old event ids exist.
  await admin.from("calendar_events").delete().eq("user_id", c.user_id).eq("provider", "google");
  await admin.from("connections").update({ calendar_id: cal.id }).eq("user_id", c.user_id).eq("provider", "google");
  return cal.id as string;
}

// A few at a time: Google rate-limits bursts per user.
async function pool<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  const q = [...xs];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()!); }));
}

// Make the Alum calendar match the tracker: create what's new, update what
// changed (by hash), delete what's gone.
async function sync(admin: SupabaseClient, c: Conn) {
  const at = await accessToken(admin, c);
  const cal = encodeURIComponent(await calendar(admin, at, c));

  const [{ data: rows, error: e1 }, { data: known, error: e2 }] = await Promise.all([
    admin.from("saved").select("job_id, status, job, deadline, remind_on, interview_at, notes").eq("user_id", c.user_id),
    admin.from("calendar_events").select("key, event_id, hash").eq("user_id", c.user_id).eq("provider", "google"),
  ]);
  if (e1 || e2) throw new Fail(503, "Couldn't read your tracker. Try again.");

  const have = new Map(known!.map((k) => [k.key, k]));
  const want = eventsFor(rows as SavedRow[]);
  const keep = new Set(want.map((e) => e.key));
  let changed = 0, failed = 0;

  await pool(want, 4, async (e) => {
    const body = googleEvent(e);
    const h = await hash(body);
    const prev = have.get(e.key);
    if (prev?.hash === h) return;
    try {
      let ev;
      if (prev) {
        try { ev = await g(at, "PUT", `/calendars/${cal}/events/${encodeURIComponent(prev.event_id)}`, body); } catch (err) { if (!gone(err)) throw err; }
      }
      ev ??= await g(at, "POST", `/calendars/${cal}/events`, body);
      await admin.from("calendar_events").upsert({ user_id: c.user_id, provider: "google", key: e.key, event_id: ev.id, hash: h });
      changed++;
    } catch (err) {
      failed++;
      console.error("google event", e.key, (err as Error).message);
    }
  });

  await pool(known!.filter((k) => !keep.has(k.key)), 4, async (k) => {
    try {
      await g(at, "DELETE", `/calendars/${cal}/events/${encodeURIComponent(k.event_id)}`);
    } catch (err) {
      if (!gone(err)) { failed++; return console.error("google delete", k.key, (err as Error).message); }
    }
    await admin.from("calendar_events").delete().eq("user_id", c.user_id).eq("provider", "google").eq("key", k.key);
    changed++;
  });

  const synced_at = new Date().toISOString();
  await admin.from("connections").update({ synced_at, status: "ok" }).eq("user_id", c.user_id).eq("provider", "google");
  return { connected: true, status: "ok", account_email: c.account_email, synced_at, events: want.length, changed, failed };
}

// Requests ----------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  if (!CLIENT_ID || !CLIENT_SECRET) return reply(503, { error: "Google Calendar isn't set up on this site yet." });

  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return reply(401, { error: "Sign in first." });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "Expected JSON." }); }

  const conn = async () => {
    const { data } = await admin.from("connections").select("user_id, refresh_token, calendar_id, time_zone, account_email, status")
      .eq("user_id", user.id).eq("provider", "google").maybeSingle();
    return data as (Conn & { status: string }) | null;
  };

  try {
    switch (body.action) {
      case "start": {
        const redirect_uri = String(body.redirect_uri ?? "");
        if (!allowedRedirect(redirect_uri)) return reply(400, { error: "That page can't connect a calendar." });
        await admin.from("oauth_states").delete().eq("user_id", user.id);
        const state = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
        // Remember the zone for the calendar we're about to make.
        await admin.from("oauth_states").insert({ state, user_id: user.id, provider: "google", redirect_uri, time_zone: zone(body.time_zone) });
        const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
          client_id: CLIENT_ID, redirect_uri, response_type: "code", access_type: "offline", prompt: "consent",
          scope: `openid email ${SCOPE}`, state,
        });
        return reply(200, { url });
      }

      case "finish": {
        const state = String(body.state ?? "");
        const { data: st } = await admin.from("oauth_states").select("*").eq("state", state).eq("user_id", user.id).maybeSingle();
        await admin.from("oauth_states").delete().eq("state", state);
        if (!st || Date.now() - Date.parse(st.created_at) > STATE_TTL) return reply(400, { error: "That sign-in to Google expired. Connect again." });

        const { ok, data } = await token({ grant_type: "authorization_code", code: String(body.code ?? ""), redirect_uri: st.redirect_uri });
        if (!ok) { console.error("google exchange", data); return reply(400, { error: "Google didn't accept that sign-in. Connect again." }); }
        // Google lets people untick boxes on the consent screen.
        if (!String(data.scope ?? "").split(" ").includes(SCOPE)) {
          return reply(400, { error: "Alum needs permission to make its calendar. Connect again and leave the calendar box ticked." });
        }
        if (!data.refresh_token) return reply(400, { error: "Google didn't give Alum lasting access. Connect again." });

        const email = emailFrom(data.id_token);
        const prev = await conn();
        // Same Google account: keep using the calendar we already made.
        const sameAccount = prev && prev.account_email === email;
        if (!sameAccount) await admin.from("calendar_events").delete().eq("user_id", user.id).eq("provider", "google");
        const row = {
          user_id: user.id, provider: "google", account_email: email, refresh_token: data.refresh_token,
          calendar_id: sameAccount ? prev.calendar_id : null, time_zone: st.time_zone, status: "ok",
        };
        const { error } = await admin.from("connections").upsert(row);
        if (error) throw error;
        return reply(200, await sync(admin, row));
      }

      case "sync": {
        const c = await conn();
        if (!c) return reply(200, { connected: false });
        if (c.status === "revoked") return reply(409, { error: "Google Calendar was disconnected. Connect it again." });
        return reply(200, await sync(admin, c));
      }

      case "disconnect": {
        const c = await conn();
        if (c) {
          // Best effort on Google's side; the connection goes either way.
          try {
            const at = await accessToken(admin, c);
            if (c.calendar_id) await g(at, "DELETE", `/calendars/${encodeURIComponent(c.calendar_id)}`).catch(() => {});
          } catch { /* already revoked */ }
          await fetch("https://oauth2.googleapis.com/revoke", {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: c.refresh_token }),
          }).catch(() => {});
          await admin.from("calendar_events").delete().eq("user_id", user.id).eq("provider", "google");
          await admin.from("connections").delete().eq("user_id", user.id).eq("provider", "google");
        }
        return reply(200, { connected: false });
      }

      default:
        return reply(400, { error: "Unknown action." });
    }
  } catch (e) {
    if (e instanceof Fail) return reply(e.status, { error: e.message });
    console.error("google-calendar", e);
    return reply(502, { error: "Google Calendar sync is down right now. Your tracker is saved." });
  }
});
