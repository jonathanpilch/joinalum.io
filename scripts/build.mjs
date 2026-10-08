/* Cloudflare build: copy only what the site serves into dist/.
 * The ingest code, its state and the repo's other files stay unpublished.
 *
 *   npm run build      Cloudflare build command; wrangler.jsonc then deploys dist/ */

import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const SITE = ["index.html", "styles.css", "app.js", "schools.js", "assets"];
const DATA = ["data/jobs.json", "data/placements.json"];

await rm("dist", { recursive: true, force: true });
await mkdir("dist/data", { recursive: true });
for (const f of SITE) await cp(f, `dist/${f}`, { recursive: true });
for (const f of DATA) await cp(f, `dist/${f}`);

// Data changes every hour and the page is tiny: always revalidate
// so nobody sees yesterday's internships. Fonts and logos can cache.
await writeFile("dist/_headers", `/data/*
  Cache-Control: public, max-age=0, must-revalidate
/*.js
  Cache-Control: public, max-age=0, must-revalidate
/*.css
  Cache-Control: public, max-age=0, must-revalidate
/assets/*
  Cache-Control: public, max-age=604800
`);

console.log(`dist/: ${SITE.length} site entries, ${DATA.length} data files`);
