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
    if (st) return { city: titleCase(segs[0].replace(/[-\s]+[A-Z0-9]*\d[A-Z0-9]*$/i, "").toLowerCase()), state: st };
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
const clean = (c) => c.replace(/\s*\(.*?\)\s*/g, "").trim();
const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
export const stateName = (a) => STATES[a] || a;

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
