/* config.js: the public settings the page needs at runtime, from the
 * environment (.env locally, the Cloudflare build's variables in prod).
 *
 *   node scripts/config.mjs [outDir]
 *
 * Only the Supabase URL and its publishable (anon) key go here; both are
 * meant to be public, and row-level security is what protects the data.
 * Without them the page runs signed-out only, on this device. */

import { readFile, writeFile } from "node:fs/promises";

// .env when there is one; real environment variables win.
try {
  for (const line of (await readFile(".env", "utf8")).split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
} catch {}

const out = process.argv[2] || ".";
const supabaseUrl = process.env.SUPABASE_URL || null;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || null;
if (process.env.SUPABASE_SERVICE_ROLE_KEY && supabaseKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_PUBLISHABLE_KEY is the service-role key. That one must never reach the browser.");
}
await writeFile(`${out}/config.js`, `window.ALUM_CONFIG = ${JSON.stringify({ supabaseUrl, supabaseKey })};\n`);
console.log(`config.js: ${supabaseUrl ? `Supabase at ${new URL(supabaseUrl).host}` : "no Supabase (signed-out only)"}`);
