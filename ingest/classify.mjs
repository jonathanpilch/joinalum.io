/* What counts: early-career, tech, in the US. Everything here is rules, so a
 * miss is a regex to fix, not a model to retrain. Each function returns null
 * for "drop it". */

// Level -----------------------------------------------------------------

const SENIOR = /\b(senior|sr\.?|staff|principal|lead|leader|manager|mgr|director|head of|vp|vice president|chief|architect|distinguished|expert|mid[- ]level|experienced|supervisor|partner|counsel|level\s*[2-9]|grade\s*[3-9]|band\s*[3-9])\b/i;
const ROMAN = /\b(II|III|IV|V|2|3|4|5)\s*$|\b(II|III|IV)\b|\bEngineer\s+[2-5]\b/;
const INTERN = /\b(intern|interns|internship|summer analyst|summer associate|summer engineer|summer scholar)\b/i;
const COOP = /\bco-?op\b/i;
// Explicit early-career language beats any seniority word ("Product Manager:
// New Grad Accelerator"); softer signals ("Associate", "Engineer I") don't.
const EXPLICIT = /\b(new grads?|new graduates?|recent grad(uate)?s?|university grad(uate)?s?|graduate program|early career|early-career|entry[- ]level|rotational|rotation program|campus hire)\b/i;
const SOFT = /\b(junior|jr\.?|apprentice(ship)?|associate|level\s*1|grade\s*1)\b/i;
const ONE = /\b(engineer|developer|analyst|scientist|programmer|technician|specialist|consultant|administrator)\s*,?\s*(I|1)\b(?!\s*[IV])/i;
// The people who hire interns aren't interns.
const NOT_A_ROLE = /\b(recruit\w*|talent acquisition|coordinator|university relations|campus relations|partnerships?|programs? (manager|lead)|high school)\b/i;

export function level(title, employment = "", text = "") {
  const t = title;
  if (NOT_A_ROLE.test(t)) return null;
  if (INTERN.test(t) || /\bintern/i.test(employment)) return "Internship";
  if (COOP.test(t)) return "Co-op";
  if (EXPLICIT.test(t)) return "New grad";
  if (SENIOR.test(t) || ROMAN.test(t)) return null;
  if (SOFT.test(t) || ONE.test(t) || /entry/i.test(employment)) return "New grad";
  // No signal in the title: let the description decide. Only a stated
  // floor of a year or less, or explicit new-grad language, gets in.
  if (/\b(new grads?|recent graduates?|graduating (in|by) 20\d\d|class of 20\d\d)\b/i.test(text)) return "New grad";
  const yrs = yearsMin(text);
  if (yrs != null && yrs <= 1) return "New grad";
  return null;
}

export function yearsMin(text) {
  if (!text) return null;
  const re = /(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(\d{1,2})?\s*\+?\s*years?(?:'|’)?\s*(?:of\s+)?(?:professional\s+|relevant\s+|industry\s+|work\s+|hands-on\s+|related\s+|full-time\s+)*(?:experience|exp\b)/gi;
  let min = null, m;
  while ((m = re.exec(text))) { const n = Number(m[1]); if (n <= 20 && (min == null || n < min)) min = n; }
  return min;
}

// Function --------------------------------------------------------------

const FN = [
  ["Quant", /\b(quant|quantitative|trader|trading|market making)\b/i],
  ["Security", /\b(security|cyber|cybersecurity|soc analyst|penetration|pen test|red team|blue team|threat|vulnerab|infosec|malware|reverse engineer|detection)\b/i],
  ["AI / ML", /\b(machine learning|ml|ai|deep learning|computer vision|nlp|llm|research scientist|applied scientist|research engineer|perception|autonomy)\b/i],
  ["Data", /\b(data scien|data engineer|data analy|analytics|business intelligence|bi developer|statistic|data platform|decision scien)/i],
  ["Hardware", /\b(hardware|embedded|firmware|fpga|asic|silicon (?:engineer|design|validation)|electrical|rf|circuit|pcb|chip|design verification|photonic|semiconductor|avionics|power electronics|analog|digital design|layout)\b/i],
  ["Software", /\b(software|developer|swe|sde|programmer|full[- ]?stack|front[- ]?end|back[- ]?end|mobile|ios|android|web|devops|site reliability|sre|platform engineer|infrastructure engineer|production engineer|forward deployed|application engineer|tools engineer|game(play)? engineer|graphics|compiler|kernel|distributed systems)\b/i],
  ["Cloud / IT", /\b(cloud|network (?:engineer|administrator|admin|analyst|operations|security|technician)|networking|systems administrator|sysadmin|information technology|it support|it specialist|help ?desk|desktop support|technical support|support engineer|solutions engineer|sales engineer|customer engineer|implementation engineer|technical account)\b|\bIT\b/i],
  ["Product", /\b(product manag|program manag|technical program|product owner|product analyst|associate product)/i],
  ["Design", /\b(ux|ui|product design|designer|user research|interaction design)\b/i],
  ["Engineering", /\b(engineer|engineering|robotics|gnc|mechatronics)\b/i],
  ["Research", /\b(research (?:scientist|engineer|intern|assistant|associate)|scientist|physicist|quantum)\b/i],
  ["Tech Consulting", /\b(technology (?:consult\w*|analyst|associate|transformation|strategy|controls|advisory|risk|solutions)|tech (?:consult\w*|strategy)|enterprise tech|digital (?:consult\w*|transformation)|solutions analyst|business analyst|systems analyst|cyber consult\w*|it audit|it advisory)\b/i],
  // Business tracks, for the Finance, Accounting and BIT majors in v1.
  ["Audit & Assurance", /\b(audit\w*|assurance|internal controls?|sox)\b/i],
  ["Tax", /\btax\b/i],
  ["Accounting", /\b(accounting|accountant|controllership|financial reporting)\b/i],
  ["Finance", /\b(financ\w*|investment|banking|banker|treasury|fp&a|valuation|wealth|capital markets|equity research|credit|underwrit\w*|actuar\w*|risk analyst)\b/i],
  ["Consulting", /\b(consult\w*|advisory|strategy)\b/i],
  ["Supply Chain & Ops", /\b(supply chain|logistics|procurement|operations analyst|operations research)\b/i],
];

export function fn(title) {
  // Words that look like functions but aren't: "Silicon Valley - Tax Intern",
  // "Research Triangle Financial Center", a tax LLM (the law degree).
  const t = title.replace(/silicon valley|research triangle|network of|business network|tax llm|\bllm - tax/gi, " ");
  for (const [name, re] of FN) if (re.test(t)) return name;
  return null;
}

// Location --------------------------------------------------------------

const STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
const NAME_TO_ABBR = Object.fromEntries(Object.entries(STATES).map(([a, n]) => [n.toLowerCase(), a]));
NAME_TO_ABBR["washington dc"] = "DC";
NAME_TO_ABBR["washington, d.c."] = "DC";
const CITY_STATE = { "new york city": "NY", "san francisco": "CA", "seattle": "WA", "boston": "MA", "chicago": "IL", "austin": "TX", "los angeles": "CA", "washington": "DC", "arlington": "VA", "mclean": "VA", "reston": "VA", "herndon": "VA", "palo alto": "CA", "mountain view": "CA", "sunnyvale": "CA", "san jose": "CA", "menlo park": "CA", "denver": "CO", "atlanta": "GA", "miami": "FL", "hawthorne": "CA", "redmond": "WA", "bellevue": "WA", "pittsburgh": "PA", "philadelphia": "PA", "dallas": "TX", "houston": "TX", "costa mesa": "CA", "sf": "CA", "nyc": "NY" };
const FOREIGN = /\b(canada|ontario|quebec|british columbia|toronto|vancouver|montreal|ottawa|calgary|waterloo|uk|u\.k\.|united kingdom|england|scotland|london|manchester|edinburgh|ireland|dublin|india|bangalore|bengaluru|hyderabad|pune|chennai|mumbai|gurgaon|gurugram|noida|delhi|singapore|germany|berlin|munich|frankfurt|france|paris|netherlands|amsterdam|japan|tokyo|australia|sydney|melbourne|israel|tel aviv|poland|warsaw|krak[oó]w|mexico|brazil|s[aã]o paulo|spain|madrid|barcelona|china|shanghai|beijing|shenzhen|hong kong|korea|seoul|taiwan|taipei|switzerland|zurich|z[uü]rich|sweden|stockholm|denmark|copenhagen|romania|bucharest|costa rica|philippines|manila|argentina|buenos aires|colombia|bogot[aá]|czech|prague|portugal|lisbon|italy|milan|uae|dubai|abu dhabi|saudi|riyadh|qatar|egypt|south africa|nigeria|kenya|new zealand|norway|oslo|finland|belgium|brussels|austria|vienna|hungary|budapest|ukraine|vietnam|thailand|bangkok|malaysia|kuala lumpur|indonesia|jakarta|chile|santiago|peru|luxembourg|serbia|belgrade|greece|athens|turkey|istanbul|emea|apac|latam|europe)\b/i;

/* One location string -> { city, state } for the US, "remote" for US remote,
 * null for anything outside the US. Handles "McLean, VA", "Falls Church,
 * Virginia", Workday's "United States-Virginia-Herndon" and "USA VA Herndon",
 * and Amazon's "US, VA, Arlington". */
export function place(raw) {
  if (!raw) return null;
  const s = raw.replace(/\((?!us\b|united)[^)]*\)/gi, " ").replace(/\s+/g, " ").trim();
  if (FOREIGN.test(s) && !/\b(united states|usa|u\.s\.)\b/i.test(s)) return null;
  if (/\bremote\b/i.test(s) || /^(united states|usa|us|u\.s\.)$/i.test(s) || /anywhere in the (us|united states)/i.test(s)) {
    const st = stateIn(s);
    return st ? { city: "Remote", state: st.abbr, remote: true } : { city: "Remote", state: null, remote: true };
  }
  if (/^\d+ Locations?$/i.test(s)) return { city: s, state: null, multi: true };

  // RTX-style Workday sites: "CEDAR RAPIDS-137 ~ 855 35Th St NE ~ BLDG 137 ~ IA ~ US"
  if (s.includes("~")) {
    const segs = s.split(/[~,]/).map((x) => x.trim()).filter((x) => !/^(us|usa|united states)$/i.test(x));
    const st = segs.map(abbr).filter(Boolean).pop();
    if (st) return { city: clean(segs[0]), state: st };
  }

  // Workday "United States-Virginia-Herndon" / "USA-VA-Herndon" / "US-CA-San Diego"
  let m = /^(?:united states(?: of america)?|usa|us)\s*[-,]\s*([A-Za-z .]+?)\s*[-,]\s*(.+)$/i.exec(s);
  if (m) { const st = abbr(m[1]); if (st) return { city: clean(m[2]), state: st }; }
  m = /^(?:usa|us)\s+([A-Z]{2})\s+(.+)$/i.exec(s);
  if (m && STATES[m[1].toUpperCase()]) return { city: clean(m[2]), state: m[1].toUpperCase() };

  // "City, ST" / "City, State" / "City, ST, USA" / "City, State, United States"
  const parts = s.split(/\s*[,|·;]\s*|\s+-\s+/).filter(Boolean).filter((p) => !/^(united states(?: of america)?|usa|us|u\.s\.a?\.?)$/i.test(p));
  for (let i = parts.length - 1; i >= 1; i--) {
    const st = abbr(parts[i]);
    if (st) return { city: clean(parts[i - 1]), state: st };
  }
  // PwC: "IL-Rosemont", "CA-Silicon Valley"
  m = /^([A-Z]{2})\s*-\s*([A-Za-z .'-]+)$/.exec(s);
  if (m && STATES[m[1]]) return { city: clean(m[2]), state: m[1] };

  // "VA - Richmond - Midlothian", "USA HI Camp Smith" handled above
  if (parts.length > 1 && abbr(parts[0])) return { city: clean(parts[parts.length - 1]), state: abbr(parts[0]) };
  if (parts.length === 1) {
    const key = parts[0].toLowerCase().replace(/\s*\(hq\)|\s*hq/g, "").trim();
    if (CITY_STATE[key]) return { city: titleCase(key === "sf" ? "san francisco" : key === "nyc" ? "new york" : key), state: CITY_STATE[key] };
    const st = abbr(parts[0]);
    if (st) return { city: null, state: st };
  }
  const key = (parts[0] || "").toLowerCase().replace(/\s*\(hq\)/, "").trim();
  if (CITY_STATE[key]) return { city: titleCase(key), state: CITY_STATE[key] };
  if (/\b(united states|usa|u\.s\.)\b/i.test(s)) return { city: null, state: null };
  return null;
}

function abbr(x) {
  const t = x.trim().replace(/\.$/, "");
  if (/^[A-Z]{2}$/.test(t) && STATES[t]) return t;
  return NAME_TO_ABBR[t.toLowerCase()] || null;
}
function stateIn(s) {
  for (const [n, a] of Object.entries(NAME_TO_ABBR)) if (new RegExp(`\\b${n}\\b`, "i").test(s)) return { abbr: a };
  return null;
}
// "ANNAPOLIS JUNCTION-339 ~ 306 Sentinel Dr ~ 339 BLDG" -> "Annapolis Junction"
const clean = (c) => {
  let x = c.split("~")[0].trim().replace(/\s*\(.*?\)\s*/g, "").replace(/-\d[\w-]*$/, "").replace(/[-\s]+(?:[A-Z]*\d[A-Z0-9]*|ETC)$/i, "").trim();
  if (x === x.toUpperCase()) x = titleCase(x.toLowerCase());
  return x;
};
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
export const stateName = (a) => STATES[a] || a;

/* One display line for a posting's locations: "McLean, VA", "Remote (US)",
 * "Atlanta, GA + 15 more", or Workday's "3 Locations". */
export function locationLabel(locs) {
  const one = (l) => (l.remote ? (l.state ? `Remote (${l.state})` : "Remote (US)") : l.city && l.state ? `${l.city}, ${l.state}` : l.city || (l.state ? stateName(l.state) : "United States"));
  const shown = locs.filter((l) => !l.multi);
  if (!locs.length) return "United States";
  if (locs[0].multi) return locs[0].city;
  return shown.length > 1 ? `${one(shown[0])} + ${shown.length - 1} more` : one(shown[0]);
}

export function places(list) {
  const out = [];
  let foreignOnly = list.length > 0;
  for (const raw of list) {
    const p = place(raw);
    if (p) { foreignOnly = false; if (!out.some((q) => q.city === p.city && q.state === p.state)) out.push(p); }
  }
  return foreignOnly ? null : out;
}

// Arrangement, term, pay ---------------------------------------------------

export function arrangement(workplace = "", locs = [], text = "") {
  const w = `${workplace}`.toLowerCase();
  if (/remote/.test(w) || (locs.length && locs.every((l) => l.remote))) return "Remote";
  if (/hybrid/.test(w)) return "Hybrid";
  if (/on-?site|in[- ]office/.test(w)) return "On-site";
  if (locs.some((l) => l.remote)) return "Remote OK";
  if (/\bhybrid\b/i.test(text.slice(0, 3000))) return "Hybrid";
  return "On-site";
}

export function term(title, text = "") {
  const hay = `${title} ${text.slice(0, 2500)}`;
  const m = /\b(summer|fall|spring|winter|autumn)\s*'?(20\d\d|\d\d)\b/i.exec(hay) || /\b(20\d\d)\s+(summer|fall|spring|winter)\b/i.exec(hay);
  if (!m) { const y = /\b(20(?:2[6-9]|3\d))\b/.exec(title); return y ? y[1] : null; }
  const season = (isNaN(m[1]) ? m[1] : m[2]).toLowerCase().replace("autumn", "fall");
  let year = isNaN(m[1]) ? m[2] : m[1];
  if (year.length === 2) year = `20${year}`;
  return `${season[0].toUpperCase()}${season.slice(1)} ${year}`;
}

// Eligibility -------------------------------------------------------------
//
// The hard gates a posting states: who can graduate when, which degree, US
// citizenship, clearance, sponsorship, a GPA floor, and the tools it asks
// for. Only what the posting says; anything missing stays unset, so the page
// can tell "not stated" from "no". Returns null when nothing was found.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, spring: 5, summer: 8, fall: 12, autumn: 12, winter: 12 };
const WHEN = String.raw`(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?|(spring|summer|fall|autumn|winter))?,?\s*(?:of\s+)?(20\d\d)`;
const ym = (mon, season, year, end) => {
  const m = MONTHS[(mon || season || "").toLowerCase().slice(0, mon ? 3 : 6)];
  return `${year}-${String(m || (end ? 12 : 1)).padStart(2, "0")}`;
};

const CLEAR_ACTIVE = /\b(active|current|existing|must (?:have|hold|possess)(?: an?)?(?: active)?|requires? an? (?:active|current))\s+(?:and\s+\w+\s+)?(?:dod\s+|u\.?s\.?\s+government\s+)?(secret|top secret|ts\/sci|ts|interim secret|security)\s*(?:\/\s*\w+\s*)?clearance/i;
const CLEAR_ANY = /\b(security clearance|secret clearance|ts\/sci|top secret|clearance (?:is |may be |will be )?required|(?:obtain|maintain|acquire|eligib\w+ for)(?: and maintain)? (?:an? )?(?:dod |government |u\.?s\.? )?(?:security )?clearance|security investigation)\b/i;
const CITIZEN = /\b(u\.?s\.? citizenship (?:is )?(?:required|is a requirement)|must be (?:a )?u\.?s\.? citizen|u\.?s\.? citizens? only|requires? u\.?s\.? citizenship|(?:only|solely) u\.?s\.? citizens|citizenship requirement|u\.?s\.? citizenship[^.]{0,40}required)/i;
const NO_SPONSOR = /\b((?:not|unable to|won['’]?t|will not|cannot|can['’]?t|does not|do not|is not able to)\s+(?:be able to\s+)?(?:provide|offer|sponsor|support|consider)[^.]{0,50}(?:sponsor|visa|h-?1b)|sponsorship (?:is |will )?not (?:be )?(?:available|provided|offered)|without (?:the need for )?(?:current or future |now or in the future )?(?:employer |visa |immigration )?sponsorship|no (?:visa |immigration )?sponsorship)/i;
const GPA = /(?:(?:minimum|min\.?|at least|cumulative|overall)\s*(?:of\s*)?(?:an?\s*)?(?:cumulative\s*|overall\s*)?(?:gpa\s*(?:of\s*)?)?([2-3]\.\d{1,2})|gpa\s*(?:of\s*)?([2-3]\.\d{1,2})\s*(?:\/\s*4\.0\s*)?(?:or (?:higher|above|better)|\+|minimum))/i;
const RETURNING = /\b(returning to (?:school|your studies|campus|university)|at least one (?:additional )?(?:semester|term|quarter)|(?:semester|term|quarter) (?:of (?:school|study|coursework) )?remaining|continue (?:your|their) (?:studies|education) after|remain(?:ing)? enrolled (?:after|following))/i;

// Tools worth matching a profile against. Order is display order fallback.
const SKILLS = [
  ["Python", /\bpython\b/i], ["Java", /\bjava\b(?!\s*script)/i], ["C++", /\bc\+\+|\bc\s*\/\s*c\+\+/i], ["C#", /\bc#|\.net\b/i],
  ["C", /\b(?:c\s*\/\s*c\+\+|c and c\+\+|embedded c|ansi c|in c\b|c programming)/i], ["JavaScript", /\bjavascript\b/i], ["TypeScript", /\btypescript\b/i],
  ["React", /\breact(?:\.js|js| native)\b|\breact\s*,|,\s*react\b/i], ["Node.js", /\bnode(?:\.js|js)\b/i], ["SQL", /\bsql\b/i], ["Go", /\bgolang\b/i], ["Rust", /\brust\b/i],
  ["Kotlin", /\bkotlin\b/i], ["Swift", /\bswift\b/i], ["MATLAB", /\bmatlab\b/i], ["Simulink", /\bsimulink\b/i], ["LabVIEW", /\blabview\b/i],
  ["SolidWorks", /\bsolid\s?works\b/i], ["CATIA", /\bcatia\b/i], ["Creo", /\bcreo\b/i], ["Siemens NX", /\bsiemens nx\b|\bnx cad\b/i], ["AutoCAD", /\bautocad\b/i],
  ["ANSYS", /\bansys\b/i], ["GD&T", /\bgd\s?&\s?t\b/i], ["Verilog", /\b(?:system)?verilog\b/i], ["VHDL", /\bvhdl\b/i], ["FPGA", /\bfpgas?\b/i],
  ["PCB design", /\bpcb\b|\baltium\b/i], ["Linux", /\blinux\b|\bunix\b/i], ["Bash", /\bbash\b|shell script/i], ["Git", /\bgit\b|\bgithub\b/i],
  ["AWS", /\baws\b|amazon web services/i], ["Azure", /\bazure\b/i], ["GCP", /\bgcp\b|google cloud/i], ["Docker", /\bdocker\b/i], ["Kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["Machine learning", /\bmachine learning\b/i], ["PyTorch", /\bpytorch\b/i], ["TensorFlow", /\btensorflow\b/i], ["Spark", /\b(?:apache spark|pyspark|spark sql)\b/i],
  ["Tableau", /\btableau\b/i], ["Power BI", /\bpower\s?bi\b/i], ["Excel", /\b(?:microsoft|ms|advanced) excel\b|\bexcel\s*(?:,|\/|and\b|spreadsheets?|skills|vba|pivot)/i], ["ROS", /\bros2?\b/i], ["Networking", /\btcp\/ip\b|\bnetworking protocols\b/i],
  ["Wireshark", /\bwireshark\b/i], ["Splunk", /\bsplunk\b/i], ["Agile", /\bagile\b|\bscrum\b/i],
];

export function skills(text, extra = []) {
  const found = new Set();
  for (const s of extra) { const hit = SKILLS.find(([n]) => n.toLowerCase() === String(s).toLowerCase()); if (hit) found.add(hit[0]); }
  if (text) for (const [name, re] of SKILLS) if (re.test(text)) found.add(name);
  return [...found].slice(0, 10);
}

export function eligibility(title, text = "") {
  const t = `${title}. ${text}`.replace(/\s+/g, " ");
  const e = {};

  // Graduation window: "graduating between December 2027 and June 2028",
  // "expected graduation date of Dec 2026 - May 2027", "graduate by Summer
  // 2028", "class of 2027".
  let m = new RegExp(String.raw`graduat\w*[^.]{0,60}?(?:between|from)\s+${WHEN}\s*(?:and|to|through|-|–|—)\s*${WHEN}`, "i").exec(t)
    || new RegExp(String.raw`graduat\w*(?: date)?(?: of| in| :|:)?\s+${WHEN}\s*(?:-|–|—|to|through)\s*${WHEN}`, "i").exec(t);
  if (m) e.grad = [ym(m[1], m[2], m[3]), ym(m[4], m[5], m[6], true)];
  else if ((m = new RegExp(String.raw`graduat\w*(?: date)?[^.]{0,30}?\b(by|before|no later than|prior to)\s+${WHEN}`, "i").exec(t))) e.grad = [null, ym(m[2], m[3], m[4], true)];
  else if ((m = new RegExp(String.raw`graduat\w*(?: date)?(?: of| in|:)\s+${WHEN}`, "i").exec(t))) e.grad = [ym(m[1], m[2], m[3]), ym(m[1], m[2], m[3], true)];
  else if ((m = /\bclass of (20\d\d)\b/i.exec(t))) e.grad = [`${m[1]}-01`, `${m[1]}-12`];
  if (e.grad && e.grad[0] && e.grad[1] && e.grad[0] > e.grad[1]) delete e.grad;
  if (RETURNING.test(t)) e.returning = true;

  // Degree floor, only when undergrads are plainly out.
  const undergrad = /\b(bachelor'?s?|undergrad\w*|b\.?s\.?\b|b\.?a\.?\b|bs\/ms|ba\/bs)/i.test(t);
  if (/\bph\.?d\b/i.test(title) && !/\b(bachelor|undergrad|b\.?s\.?|m\.?s\.?|master)/i.test(title)) e.degree = "PhD";
  else if (!undergrad && /\b(?:enrolled in|pursuing|working towards?)\s+(?:an?\s+)?(?:ph\.?d|doctoral|doctorate)\b/i.test(t) && !/master/i.test(t)) e.degree = "PhD";
  else if (/\bmba\b/i.test(title)) e.degree = "Grad";
  else if (/\b(master'?s|m\.?s\.?|graduate student)\b.{0,20}\b(intern|co-?op)/i.test(title) && !/\b(bachelor|undergrad|b\.?s\.?)/i.test(title)) e.degree = "Grad";
  else if (!undergrad && /\b(?:enrolled in|pursuing)\s+(?:an?\s+)?(?:master'?s|graduate degree|graduate program)/i.test(t)) e.degree = "Grad";

  // "Active and existing clearance required after day 1" (RTX) is one to
  // get once hired, not one to walk in with.
  // Nor is one listed under preferred qualifications (Northrop).
  const active = CLEAR_ACTIVE.exec(t);
  const before = active ? t.slice(0, active.index) : "";
  const lastAt = (re) => Math.max(-1, ...[...before.matchAll(re)].map((m) => m.index));
  const preferred = lastAt(/preferred (?:qualifications|skills|experience)|nice to have|desired (?:qualifications|skills)|bonus points/gi) > lastAt(/(?:basic|required|minimum) qualifications|requirements:|you must have/gi);
  if (active && !preferred && !/^.{0,40}\b(after (?:day (?:1|one)|your start|start date|hire)|upon (?:hire|start)|within \d+|once hired)/i.test(t.slice(active.index + active[0].length))) e.clearance = "active";
  else if (active || CLEAR_ANY.test(t)) e.clearance = "obtain";
  if (e.clearance) {
    const lvl = /\b(ts\/sci|top secret|secret)\b/i.exec(t)?.[1].toLowerCase();
    if (lvl) e.clearanceLevel = lvl === "ts/sci" ? "TS/SCI" : lvl === "top secret" ? "Top Secret" : "Secret";
  }
  if (CITIZEN.test(t) || e.clearance) e.citizen = true;
  if (NO_SPONSOR.test(t)) e.noSponsor = true;
  if ((m = GPA.exec(t))) { const g = Number(m[1] || m[2]); if (g >= 2 && g <= 3.9) e.gpa = g; }

  return Object.keys(e).length ? e : null;
}

const PAY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|K)?\s*(?:-|–|—|to)\s*\$?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|K)?(\s*(?:\/|per)\s*(?:hour|hr|year|yr|annum))?/;

export function pay(existing, text = "") {
  if (existing) return existing;
  const m = PAY.exec(text);
  if (!m) return null;
  const n = (v, k) => Number(v.replace(/,/g, "")) * (k ? 1000 : 1);
  const lo = n(m[1], m[2]), hi = n(m[3], m[4]);
  if (!lo || !hi || hi < lo) return null;
  if (hi < 300) return `$${Math.round(lo)}–$${Math.round(hi)}/hr`;
  if (lo < 20000) return null;
  return `$${Math.round(lo / 1000)}k–$${Math.round(hi / 1000)}k`;
}
