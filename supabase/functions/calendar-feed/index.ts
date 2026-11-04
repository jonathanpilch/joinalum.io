// calendar-feed: a student's tracker as an iCal feed, for any calendar that
// can subscribe by URL (Apple Calendar, Outlook, Fastmail, and Google too,
// though Google refreshes subscriptions slowly; google-calendar is the fast way).
//
// GET ?token=<calendar_feeds.token>
// Public by necessity (calendar apps send no session), so deploy with
// --no-verify-jwt. The token is the secret; a wrong one gets a 404.

import { createClient } from "npm:@supabase/supabase-js@2";
import { eventsFor, ics, type SavedRow } from "../_shared/calendar.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("GET only", { status: 405 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("Not found", { status: 404 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: feed } = await admin.from("calendar_feeds").select("user_id").eq("token", token).maybeSingle();
  if (!feed) return new Response("Not found", { status: 404 });

  const { data: rows, error } = await admin.from("saved")
    .select("job_id, status, job, deadline, remind_on, interview_at, notes").eq("user_id", feed.user_id);
  if (error) return new Response("Try again later", { status: 503 });

  return new Response(req.method === "HEAD" ? null : ics(eventsFor(rows as SavedRow[])), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="alum.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
});
