/* Employer wordmarks for the landing page's logo slider.
 *
 *   node scripts/logos.mjs            fetch any listed company that has no logo yet
 *   node scripts/logos.mjs --force    refetch all of them
 *
 * Each company's logo comes from the infobox of its Wikipedia article (the
 * official mark, usually an SVG on Wikimedia Commons). SVGs are cleaned of
 * anything active (scripts, event handlers, external references) before they
 * go in assets/logos/. assets/logos/index.json maps company -> file; the page
 * falls back to the company's name in type when a company isn't there. */

import { mkdir, readFile, writeFile } from "node:fs/promises";

const DIR = new URL("../assets/logos/", import.meta.url);
const INDEX = new URL("index.json", DIR);
const UA = { "user-agent": "AlumLogoFetcher/1.0 (https://joinalum.io; logos for an internship board)" };
const FORCE = process.argv.includes("--force");

// Company (as the board names it) -> Wikipedia article.
const COMPANIES = {
  Deloitte: "Deloitte",
  Boeing: "Boeing",
  "Northrop Grumman": "Northrop Grumman",
  Amazon: "Amazon (company)",
  "Capital One": "Capital One",
  PwC: "PwC",
  Accenture: "Accenture",
  RTX: "RTX Corporation",
  CACI: "CACI",
  "Booz Allen Hamilton": "Booz Allen Hamilton",
  "Wells Fargo": "Wells Fargo",
  "Fannie Mae": "Fannie Mae",
  Leidos: "Leidos",
  "Freddie Mac": "Freddie Mac",
  Disney: "The Walt Disney Company",
  Protiviti: "Protiviti",
  Vanguard: "The Vanguard Group",
  "General Motors": "General Motors",
  GDIT: "General Dynamics Information Technology",
  Micron: "Micron Technology",
  Cisco: "Cisco",
  Salesforce: "Salesforce",
  Samsara: "Samsara (company)",
  NVIDIA: "Nvidia",
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const readJson = async (u, d) => { try { return JSON.parse(await readFile(u, "utf8")); } catch { return d; } };

// The file named in the article's infobox `logo` field.
async function logoFile(article) {
  const u = `https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&section=0&redirects=1&page=${encodeURIComponent(article)}`;
  const { parse } = await (await fetch(u, { headers: UA })).json();
  const text = parse?.wikitext?.["*"] || "";
  const line = /\|\s*logo\s*=\s*([^\n]+)/i.exec(text)?.[1] || "";
  return /([^|[\]=:{}]+?\.(?:svg|png))/i.exec(line)?.[1]?.trim() || null;
}

// Strip what an SVG shouldn't carry onto a website.
function clean(svg) {
  return svg
    .replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/gi, "")
    .replace(/<(script|foreignObject|metadata)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|foreignObject)[^>]*\/>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("|')(?!#|data:image\/)[^"']*\1/gi, "")
    .trim()
    // Give every logo a viewBox, so it scales to whatever height the page sets.
    .replace(/<svg\b[^>]*>/i, (tag) => {
      if (/viewBox=/i.test(tag)) return tag;
      const num = (k) => parseFloat(new RegExp(`\\s${k}\\s*=\\s*["']?([\\d.]+)`, "i").exec(tag)?.[1]);
      const w = num("width"), h = num("height");
      return w && h ? tag.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`) : tag;
    });
}

// Width / height, so the page can size marks by area: a square mark and a
// long wordmark then look equally big.
async function aspectOf(url, ext) {
  const buf = await readFile(url);
  if (ext === "png") return Math.round((buf.readUInt32BE(16) / buf.readUInt32BE(20)) * 1000) / 1000;
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(buf.toString("utf8"));
  return vb ? Math.round((parseFloat(vb[1]) / parseFloat(vb[2])) * 1000) / 1000 : 3;
}

await mkdir(DIR, { recursive: true });
const index = await readJson(INDEX, {});
for (const [company, article] of Object.entries(COMPANIES)) {
  if (index[company] && !FORCE) continue;
  try {
    const file = await logoFile(article);
    if (!file) { console.log(`- ${company}: no logo in the infobox`); continue; }
    // Free logos live on Commons; trademarked ones English Wikipedia keeps itself.
    const path = `Special:FilePath/${encodeURIComponent(file.replace(/ /g, "_"))}`;
    let r = await fetch(`https://commons.wikimedia.org/wiki/${path}`, { headers: UA, redirect: "follow" });
    let host = "commons.wikimedia.org";
    if (r.status === 404) { r = await fetch(`https://en.wikipedia.org/wiki/${path}`, { headers: UA, redirect: "follow" }); host = "en.wikipedia.org"; }
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`);
    const ext = file.toLowerCase().endsWith(".svg") ? "svg" : "png";
    const name = `${slug(company)}.${ext}`;
    if (ext === "svg") {
      const svg = clean(await r.text());
      if (!/^<svg[\s>]/i.test(svg)) throw new Error("not an SVG");
      await writeFile(new URL(name, DIR), svg);
    } else {
      await writeFile(new URL(name, DIR), Buffer.from(await r.arrayBuffer()));
    }
    index[company] = { file: name, aspect: await aspectOf(new URL(name, DIR), ext), source: `https://${host}/wiki/File:${file.replace(/ /g, "_")}` };
    console.log(`✓ ${company}: ${file}`);
  } catch (e) {
    console.log(`✗ ${company}: ${e.message}`);
  }
}
await writeFile(INDEX, JSON.stringify(index, null, 2) + "\n");
console.log(`\n${Object.keys(index).length} logos in assets/logos/`);
