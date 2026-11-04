// The tracker as calendar events, shared by google-calendar (pushes them to
// the student's "Alum" Google calendar) and calendar-feed (serves them as an
// iCal feed to Apple, Outlook and the rest). One list, so every calendar
// shows the same thing.
//
// What goes on the calendar:
//   deadline   all day, while the role is still just Saved (once you've
//              applied, the deadline is noise)
//   remind     all day, the "Remind me on" date, until it's a rejection
//   interview  an hour at interview_at, until it's a rejection

export type SavedRow = {
  job_id: string;
  status: string;
  job: { title?: string; company?: string; location?: string; url?: string };
  deadline: string | null;      // "2026-11-01"
  remind_on: string | null;     // "2026-11-01"
  interview_at: string | null;  // ISO timestamp
  notes: string | null;
};

export type AlumEvent = {
  key: string;                  // "<job_id>:deadline", stable across syncs
  title: string;
  description: string;
  link: string;                 // the role in Alum
  date?: string;                // all-day events
  start?: string;               // timed events, ISO
  end?: string;
  alarms: number[];             // minutes before start; for all-day, before midnight
};

export const SITE = (Deno.env.get("SITE_URL") || "https://joinalum.io").replace(/\/$/, "");

const HOUR = 60;
// 9am the day before, 9am two days before (all-day events count from midnight).
const DAY_BEFORE = 15 * HOUR;
const TWO_DAYS_BEFORE = 39 * HOUR;

export function eventsFor(rows: SavedRow[]): AlumEvent[] {
  const out: AlumEvent[] = [];
  for (const r of rows) {
    const company = r.job?.company || "Internship";
    const role = r.job?.title || "";
    const name = role ? `${company} · ${role}` : company;
    const link = `${SITE}/app?job=${encodeURIComponent(r.job_id)}`;
    const description = [
      r.job?.location,
      r.job?.url && `Posting: ${r.job.url}`,
      r.notes?.trim() && `Notes:\n${r.notes.trim().slice(0, 1500)}`,
      `In Alum: ${link}`,
    ].filter(Boolean).join("\n\n");
    const base = { description, link };

    if (r.deadline && r.status === "Saved") {
      out.push({ ...base, key: `${r.job_id}:deadline`, title: `Apply: ${name}`, date: r.deadline, alarms: [TWO_DAYS_BEFORE, DAY_BEFORE] });
    }
    if (r.remind_on && r.status !== "Rejected") {
      out.push({ ...base, key: `${r.job_id}:remind`, title: `Reminder: ${name}`, date: r.remind_on, alarms: [-9 * HOUR] }); // 9am that day
    }
    if (r.interview_at && r.status !== "Rejected") {
      const start = new Date(r.interview_at);
      if (!isNaN(+start)) {
        out.push({ ...base, key: `${r.job_id}:interview`, title: `Interview: ${name}`, start: start.toISOString(), end: new Date(+start + 36e5).toISOString(), alarms: [24 * HOUR, HOUR] });
      }
    }
  }
  return out;
}

export const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

// Google Calendar -------------------------------------------------------------------

export function googleEvent(e: AlumEvent) {
  return {
    summary: e.title,
    description: e.description,
    ...(e.date
      ? { start: { date: e.date }, end: { date: nextDay(e.date) }, transparency: "transparent" }
      : { start: { dateTime: e.start }, end: { dateTime: e.end } }),
    reminders: { useDefault: false, overrides: e.alarms.filter((m) => m >= 0).map((minutes) => ({ method: "popup", minutes })) },
    source: { title: "Alum", url: e.link },
    extendedProperties: { private: { alum: e.key } },
  };
}

export async function hash(x: unknown) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(x)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// iCalendar (RFC 5545) --------------------------------------------------------------

const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsTime = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDate = (d: string) => d.replace(/-/g, "");

// Lines over 75 octets continue on the next line after a space; never split a character.
function fold(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "", size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) { parts.push(cur); cur = ""; size = 0; }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function ics(events: AlumEvent[], name = "Alum") {
  const stamp = icsTime(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Alum//Tracker//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(name)}`, "X-WR-CALDESC:Deadlines\\, reminders and interviews from your Alum tracker",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${icsText(e.key)}@joinalum.io`, `DTSTAMP:${stamp}`);
    if (e.date) lines.push(`DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(e.date))}`, "TRANSP:TRANSPARENT");
    else lines.push(`DTSTART:${icsTime(e.start!)}`, `DTEND:${icsTime(e.end!)}`);
    lines.push(`SUMMARY:${icsText(e.title)}`, `DESCRIPTION:${icsText(e.description)}`, `URL:${e.link}`);
    for (const m of e.alarms) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:${m < 0 ? "" : "-"}PT${Math.abs(m)}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
