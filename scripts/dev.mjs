/* Local dev server: the site from the repo root, never cached, so a browser
 * can't mix yesterday's app.js with today's page. Writes config.js first.
 *
 *   npm run dev      http://localhost:5178 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";

const PORT = Number(process.env.PORT) || 5178;
const ROOT = process.cwd();
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon" };

execFileSync(process.execPath, ["scripts/config.mjs"], { stdio: "inherit" });

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path.includes("..") || /(^|\/)\.(env|git)/.test(path)) { res.writeHead(404).end(); return; }
  let file = join(ROOT, path);
  // Like Cloudflare: "/" -> index.html, "/app" -> app.html.
  try { if ((await stat(file)).isDirectory()) file = join(file, "index.html"); } catch { if (!extname(file)) file += ".html"; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}).listen(PORT, () => console.log(`Alum dev: http://localhost:${PORT}`));
