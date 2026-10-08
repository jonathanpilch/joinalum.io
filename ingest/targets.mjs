/* The employers v1 shows: the companies that hire the most Hokies from the
 * launch majors, per VT's placement report. Each one is pulled directly when
 * we have a fetcher for its board (free, hourly), otherwise through
 * fantastic.jobs, which never spends credits on a company we pull ourselves.
 *
 *   node ingest/targets.mjs      writes data/targets.json, prints the list
 *
 * Reads data/placements.json, so run `npm run placements` first. */

import { readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);
const N = 150;

export const LAUNCH_MAJORS = [
  "Computer Science",
  "Computer Engineering",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Aerospace Engineering",
  "Industrial and Systems Engineering",
  "Business Information Technology",
  "Finance",
  "Accounting and Information Systems",
  "Computational Modeling and Data Analytics",
];

// Government, military and schools hire through USAJOBS or their own
// systems, not the boards either source reads. They come later.
const NOT_A_TARGET = /^U\.S\.|Virginia Tech|naval shipyard|national security agency|postal service|federal reserve|aramco|department of|county|city of|commonwealth of|university|college|school|^RSI$/i;

/* Employer domains for fantastic.jobs' `domain` filter, which is exact.
 * null = not sure of the domain; that company is matched by name instead
 * (`organization`, fuzzy) until a real result confirms its domain. */
const DOMAINS = {
  "EY": ["ey.com"],
  "KPMG": ["kpmg.com"],
  "Lockheed Martin": ["lockheedmartin.com"],
  "IBM": ["ibm.com"],
  "GE": ["ge.com", "geaerospace.com", "gevernova.com"],
  "CGI": ["cgi.com"],
  "Microsoft": ["microsoft.com"],
  "RSM": ["rsmus.com"],
  "Huntington Ingalls (HII)": ["hii.com"],
  "Peraton": ["peraton.com"],
  "General Dynamics": ["gd.com", "gdmissionsystems.com", "gdeb.com", "gdls.com", "gulfstream.com"],
  "Grant Thornton": ["grantthornton.com"],
  "Baker Tilly": ["bakertilly.com"],
  "Altec": ["altec.com"],
  "Cherry Bekaert": ["cbh.com"],
  "Epic": ["epic.com"],
  "Altria": ["altria.com"],
  "Ford Motor Company": ["ford.com"],
  "Dominion Energy": ["dominionenergy.com"],
  "M.C. Dean": ["mcdean.com"],
  "BDO": ["bdo.com"],
  "Cognizant": ["cognizant.com"],
  "Citi": ["citi.com"],
  "Kearney & Company": ["kearneyco.com"],
  "L3Harris": ["l3harris.com"],
  "PepsiCo": ["pepsico.com"],
  "Textron": ["textron.com"],
  "JPMorgan Chase": ["jpmorganchase.com"],
  "Fidelity Investments": ["fidelity.com"],
  "Goldman Sachs": ["goldmansachs.com"],
  "BAE Systems": ["baesystems.com"],
  "Google": ["google.com"],
  "GEICO": ["geico.com"],
  "Volvo Group": ["volvogroup.com"],
  "Meta": ["meta.com"],
  "Groundswell": null,
  "Solers, Inc.": ["solers.com"],
  "Cummins Inc.": ["cummins.com"],
  "Honeywell": ["honeywell.com"],
  "Deutsche Bank": ["db.com"],
  "Forvis Mazars": ["forvismazars.us"],
  "Lowe's Companies, Inc.": ["lowes.com"],
  "Johns Hopkins APL": ["jhuapl.edu"],
  "Qualcomm": ["qualcomm.com"],
  "Kollmorgen Corporation": ["kollmorgen.com", "regalrexnord.com"],
  "NTT DATA": ["nttdata.com"],
  "Clark Construction Group": ["clarkconstruction.com"],
  "ExxonMobil": ["exxonmobil.com"],
  "Innovative Refrigeration Systems, Inc.": null,
  "Framatome Inc.": ["framatome.com"],
  "Excella Consulting": ["excella.com"],
  "Texas Instruments": ["ti.com"],
  "Alarm.com": ["alarm.com"],
  "BWX Technologies, Inc.": ["bwxt.com"],
  "Coalfire Systems": ["coalfire.com"],
  "Oracle": ["oracle.com"],
  "Nielsen Company": ["nielsen.com"],
  "Norfolk Southern Corporation": ["norfolksouthern.com"],
  "Cotton & Company LLP": ["cottoncpa.com"],
  "Moog": ["moog.com"],
  "Eastman": ["eastman.com"],
  "SAIC": ["saic.com"],
  "Systems Planning and Analysis (SPA)": ["spa.com"],
  "Verizon": ["verizon.com"],
  "Rolls-Royce": ["rolls-royce.com"],
  "Technomics": ["technomics.net"],
  "NewDay USA": ["newdayusa.com"],
  "Parsons": ["parsons.com"],
  "Red Hat": ["redhat.com"],
  "MicroStrategy, Inc.": ["strategy.com", "microstrategy.com"],
  "Davenport & Company LLC": ["investdavenport.com"],
  "Broadcom": ["broadcom.com"],
  "American Woodmark": ["americanwoodmark.com"],
  "AECOM": ["aecom.com"],
  "Noblis": ["noblis.org"],
  "Alpine Consulting Partners": null,
  "Guidehouse": ["guidehouse.com"],
  "Keiter": ["keitercpa.com"],
  "ViaSat, Inc.": ["viasat.com"],
  "Carahsoft Technology Corp.": ["carahsoft.com"],
  "NetApp": ["netapp.com"],
  "memoryBlue": ["memoryblue.com"],
  "HITT Contracting, Inc.": ["hitt.com"],
  "Parker Hannifin Corporation": ["parker.com"],
  "AT&T": ["att.com"],
  "W.L. Gore & Associates, Inc.": ["gore.com"],
  "WestRock": ["smurfitwestrock.com", "westrock.com"],
  "srcLogic": null,
  "YHB (Yount, Hyde & Barbour, P.C.)": ["yhbcpa.com"],
  "CliftonLarsonAllen": ["claconnect.com"],
  "Ferguson Enterprises, Inc.": ["ferguson.com"],
  "Whiting-Turner": ["whiting-turner.com"],
  "Truist": ["truist.com"],
  "G3 Technologies, Inc.": null,
  "Target": ["target.com"],
  "International Paper": ["internationalpaper.com"],
  "Walmart": ["walmart.com"],
  "Caterpillar Inc.": ["caterpillar.com"],
  "RoviSys": ["rovisys.com"],
  "Apple": ["apple.com"],
  "Brown Edwards": ["brownedwards.com"],
  "Herren Associates": ["herrenassociates.com"],
  "Fortna Inc.": ["fortna.com"],
  "Trane Technologies": ["tranetechnologies.com"],
  "UPS (United Parcel Service)": ["ups.com"],
  "CohnReznick": ["cohnreznick.com"],
  "Eaton": ["eaton.com"],
  "Ameriprise Financial": ["ameriprise.com"],
  "Cvent Inc.": ["cvent.com"],
  "Corning Incorporated": ["corning.com"],
  "Wiley|Wilson": ["wileywilson.com"],
  "SimonComputing, Inc": ["simoncomputing.com"],
  "Visa": ["visa.com"],
  "BIT Systems, Inc.": null,
  "Hughes Network Systems": ["hughes.com"],
  "Insight Global": ["insightglobal.com"],
  "Honda R&D Americas, Inc.": ["honda.com"],
  "Tate & Tryon": ["tatetryon.com"],
  "Ingersoll-Rand": ["irco.com"],
  "MPR Associates, Inc": ["mpr.com"],
};

// Build ----------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const P = JSON.parse(await readFile(new URL("data/placements.json", ROOT), "utf8"));
  const launch = (e) => LAUNCH_MAJORS.reduce((a, m) => a + (e.byMajor[m] || 0), 0);

  const ranked = Object.entries(P.employers)
    .filter(([name]) => !NOT_A_TARGET.test(name))
    .map(([name, e]) => ({ name, hires: launch(e), e }))
    .filter((r) => r.hires > 0)
    .sort((a, b) => b.hires - a.hires)
    .slice(0, N);

  const targets = ranked.map(({ name, hires, e }) => ({
    name,
    hires, // launch-major hires since the class of 2014
    recent: e.recent, // all-major hires, last three classes
    majors: Object.fromEntries(LAUNCH_MAJORS.filter((m) => e.byMajor[m]).map((m) => [m, e.byMajor[m]])),
    source: e.board ? "direct" : "fantastic",
    board: e.board || null,
    domains: e.board ? null : DOMAINS[name] ?? null,
  }));

  await writeFile(new URL("data/targets.json", ROOT), JSON.stringify({ generatedAt: new Date().toISOString(), launchMajors: LAUNCH_MAJORS, targets }, null, 1));

  const all = Object.values(P.employers).reduce((a, e) => a + launch(e), 0);
  const covered = targets.reduce((a, t) => a + t.hires, 0);
  const direct = targets.filter((t) => t.source === "direct");
  const byDomain = targets.filter((t) => t.source === "fantastic" && t.domains);
  const byName = targets.filter((t) => t.source === "fantastic" && !t.domains);
  const unknown = targets.filter((t) => t.source === "fantastic" && !(t.name in DOMAINS));

  targets.forEach((t, i) => console.log(`${String(i + 1).padStart(3)}. ${t.name.padEnd(40).slice(0, 40)} ${String(t.hires).padStart(4)}  ${t.source === "direct" ? `direct (${t.board})` : t.domains ? `fantastic  ${t.domains.join(", ")}` : "fantastic  by name"}`));
  console.log(`\n${targets.length} targets cover ${covered} of ${all} launch-major hires (${Math.round((100 * covered) / all)}%)`);
  console.log(`direct ${direct.length} · fantastic by domain ${byDomain.length} · fantastic by name ${byName.length}`);
  if (unknown.length) console.log(`\nNOT IN DOMAINS (add them): ${unknown.map((t) => t.name).join(" | ")}`);
}
