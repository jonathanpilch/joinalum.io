/* Employer names, made comparable. VT's report says "Northrop Grumman
 * Mission Systems Baltimore", a profile says "@northropgrumman", the board
 * says "Northrop Grumman": all one employer. canonical() turns any of them
 * into one display name; board() says which ingest company that is, if any. */

import companies from "./companies.mjs";

// Parent companies, subsidiaries and the usual spellings. First match wins,
// so the specific ones (GDIT) sit above the general ones (General Dynamics).
const PARENTS = [
  [/northrop|northrup/, "Northrop Grumman"], // "Northrup" appears 22 times in VT's report
  [/lockheed/, "Lockheed Martin"],
  [/booz ?allen/, "Booz Allen Hamilton"],
  [/general dynamics information technology|^gdit\b|general dynamics it\b/, "GDIT"],
  [/general dynamics|electric boat|bath iron works|gulfstream/, "General Dynamics"],
  [/raytheon|^rtx\b|collins aerospace|pratt (and|&) whitney|rockwell collins/, "RTX"],
  [/boeing/, "Boeing"],
  [/^bae\b|bae systems/, "BAE Systems"],
  [/l3 ?harris|^harris corp|^l ?3 /, "L3Harris"],
  [/huntington ingalls|newport news shipbuilding|^hii\b/, "Huntington Ingalls (HII)"],
  [/^leidos/, "Leidos"],
  [/^caci\b/, "CACI"],
  [/^saic\b|science applications international/, "SAIC"],
  [/^mitre\b/, "MITRE"],
  [/^peraton/, "Peraton"],
  [/^mantech/, "ManTech"],
  [/accenture/, "Accenture"],
  [/deloitte/, "Deloitte"],
  [/^ey\b|ernst (and|&) young/, "EY"],
  [/pricewaterhouse|^pwc\b/, "PwC"],
  [/^kpmg\b/, "KPMG"],
  [/^rsm\b/, "RSM"],
  [/^grant thornton/, "Grant Thornton"],
  [/^amazon|^aws\b|annapurna labs/, "Amazon"],
  [/^microsoft/, "Microsoft"],
  [/^google|^alphabet/, "Google"],
  [/^meta\b|^facebook/, "Meta"],
  [/^apple\b/, "Apple"],
  [/^ibm\b|international business machines/, "IBM"],
  [/^oracle\b/, "Oracle"],
  [/^cisco/, "Cisco"],
  [/^intel\b/, "Intel"],
  [/^nvidia/, "NVIDIA"],
  [/^salesforce/, "Salesforce"],
  [/^capital one|^capitalone/, "Capital One"],
  [/^freddie mac/, "Freddie Mac"],
  [/^fannie mae/, "Fannie Mae"],
  [/^bank of america|^merrill/, "Bank of America"],
  [/^jp ?morgan|^j\.?p\.? morgan|^chase\b/, "JPMorgan Chase"],
  [/^goldman sachs/, "Goldman Sachs"],
  [/^wells fargo/, "Wells Fargo"],
  [/^truist|^bb&t|^suntrust/, "Truist"],
  [/^mastercard/, "Mastercard"],
  [/^navy federal/, "Navy Federal Credit Union"],
  [/^carmax/, "CarMax"],
  [/^dominion\b|^dominion energy/, "Dominion Energy"],
  [/^general motors|^gm\b/, "General Motors"],
  [/^epic( systems)?$/, "Epic"],
  [/^cgi\b/, "CGI"],
  [/^costar/, "CoStar Group"],
  [/^pepsico|^frito/, "PepsiCo"],
  [/^altria|^philip morris usa/, "Altria"],
  [/^spacex|space exploration technologies/, "SpaceX"],
  [/^palantir/, "Palantir"],
  [/^appian/, "Appian"],
  [/^micron/, "Micron"],
  [/^disney|walt disney/, "Disney"],
  [/^hp\b|^hp inc|hewlett[- ]packard$/, "HP"],
  [/^moog\b/, "Moog"],
  [/^volvo/, "Volvo Group"],
  [/^kimley[- ]horn/, "Kimley-Horn"],
  [/^whiting[- ]turner/, "Whiting-Turner"],
  [/^memoryblue/, "memoryBlue"],
  [/^us army|^u s army|^united states army|^army\b|^army national guard/, "U.S. Army"],
  [/^us navy|^u s navy|^united states navy|^navy\b|^navsea|^naval /, "U.S. Navy"],
  [/^us air force|^u s air force|^united states air force|^air force\b/, "U.S. Air Force"],
  [/^us marine|^united states marine|^marine corps/, "U.S. Marine Corps"],
  [/^virginia tech|^virginia polytechnic/, "Virginia Tech"],
];

const SUFFIX = /\b(inc|incorporated|llc|llp|lp|ltd|plc|corp|corporation|co|company|companies|group|holdings|the|usa|us|na|n a)\b/g;

export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[.,'’]/g, "")
    .replace(/[^a-z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Display name for any spelling, or null for "--Not Applicable" and blanks. */
export function canonical(raw) {
  if (!raw || /not applicable|^-+$|^'?-$|^n\/?a$|^none$|^self|confidential/i.test(raw.trim())) return null;
  const n = norm(raw);
  if (!n) return null;
  for (const [re, name] of PARENTS) if (re.test(n)) return name;
  return null; // caller falls back to a cleaned-up raw name
}

export const key = (raw) => canonical(raw) || norm(raw).replace(SUFFIX, " ").replace(/\s+/g, " ").trim();

// Ingest companies, by every name they go by.
const boardByKey = new Map();
for (const c of companies) {
  boardByKey.set(key(c.name), c.name);
  boardByKey.set(norm(c.name), c.name);
}
export const board = (name) => boardByKey.get(key(name)) || boardByKey.get(norm(name)) || null;
