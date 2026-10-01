/* Who we pull from, and where their board lives. Every entry was probed live
 * (2026-09-30); a board that stops answering is logged and skipped, never fatal.
 *
 *   gh  Greenhouse      boards-api.greenhouse.io/v1/boards/{slug}
 *   lv  Lever           api.lever.co/v0/postings/{slug}
 *   ab  Ashby           api.ashbyhq.com/posting-api/job-board/{slug}
 *   sr  SmartRecruiters api.smartrecruiters.com/v1/companies/{slug}
 *   wd  Workday         {tenant}.{host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}
 *   amzn                amazon.jobs/en/search.json
 *
 * `vt: true` marks employers that recruit hard out of Virginia Tech -- our own
 * list, from career-fair rosters and where Hokies end up. `sector` drives the
 * industry chip. */

const gh = (name, slug, domain, sector, vt = false) => ({ name, ats: "gh", slug, domain, sector, vt });
const lv = (name, slug, domain, sector, vt = false) => ({ name, ats: "lv", slug, domain, sector, vt });
const ab = (name, slug, domain, sector, vt = false) => ({ name, ats: "ab", slug, domain, sector, vt });
const sr = (name, slug, domain, sector, vt = false) => ({ name, ats: "sr", slug, domain, sector, vt });
const wd = (name, tenant, host, site, domain, sector, vt = false) => ({ name, ats: "wd", tenant, host, site, domain, sector, vt });

export default [
  // Defense, government tech, and the DC/NoVA pipeline
  wd("Northrop Grumman", "ngc", "wd1", "Northrop_Grumman_External_Site", "northropgrumman.com", "Defense", true),
  wd("Booz Allen Hamilton", "bah", "wd1", "BAH_Jobs", "boozallen.com", "Defense", true),
  wd("Leidos", "leidos", "wd5", "External", "leidos.com", "Defense", true),
  wd("GDIT", "gdit", "wd5", "External_Career_Site", "gdit.com", "Defense", true),
  wd("CACI", "caci", "wd1", "External", "caci.com", "Defense", true),
  wd("Boeing", "boeing", "wd1", "EXTERNAL_CAREERS", "boeing.com", "Aerospace", true),
  wd("RTX", "globalhr", "wd5", "REC_RTX_Ext_Gateway", "rtx.com", "Aerospace", true),
  gh("Anduril", "andurilindustries", "anduril.com", "Defense"),
  lv("Palantir", "palantir", "palantir.com", "Defense", true),
  lv("Shield AI", "shieldai", "shield.ai", "Defense"),
  gh("Epirus", "epirus", "epirusinc.com", "Defense"),
  ab("Saronic", "saronic", "saronic.com", "Defense"),
  gh("Shift5", "shift5", "shift5.io", "Security"),
  gh("Appian", "appian", "appian.com", "Software", true),

  // Finance and fintech
  wd("Capital One", "capitalone", "wd12", "Capital_One", "capitalone.com", "Finance", true),
  wd("Freddie Mac", "freddiemac", "wd5", "External", "freddiemac.com", "Finance", true),
  wd("Fannie Mae", "fanniemae", "wd1", "FannieMaeCareers", "fanniemae.com", "Finance", true),
  wd("Mastercard", "mastercard", "wd1", "CorporateCareers", "mastercard.com", "Finance", true),
  gh("Stripe", "stripe", "stripe.com", "Fintech"),
  gh("Robinhood", "robinhood", "robinhood.com", "Fintech"),
  gh("Coinbase", "coinbase", "coinbase.com", "Fintech"),
  gh("Affirm", "affirm", "affirm.com", "Fintech"),
  gh("Brex", "brex", "brex.com", "Fintech"),
  ab("Ramp", "ramp", "ramp.com", "Fintech"),
  ab("Plaid", "plaid", "plaid.com", "Fintech"),
  gh("Chime", "chime", "chime.com", "Fintech"),
  gh("SoFi", "sofi", "sofi.com", "Fintech"),
  gh("Toast", "toast", "toasttab.com", "Fintech"),

  // Quant and trading
  gh("Jane Street", "janestreet", "janestreet.com", "Quant"),
  gh("IMC Trading", "imc", "imc.com", "Quant"),
  gh("Jump Trading", "jumptrading", "jumptrading.com", "Quant"),
  gh("Point72", "point72", "point72.com", "Quant"),
  gh("Akuna Capital", "akunacapital", "akunacapital.com", "Quant"),
  gh("Virtu Financial", "virtu", "virtu.com", "Quant"),

  // Big tech and enterprise
  { name: "Amazon", ats: "amzn", domain: "amazon.com", sector: "Big Tech", vt: true },
  wd("NVIDIA", "nvidia", "wd5", "NVIDIAExternalCareerSite", "nvidia.com", "Semiconductors"),
  wd("Salesforce", "salesforce", "wd12", "External_Career_Site", "salesforce.com", "Software"),
  wd("Cisco", "cisco", "wd5", "Cisco_Careers", "cisco.com", "Networking"),
  wd("Intel", "intel", "wd1", "External", "intel.com", "Semiconductors"),
  wd("Micron", "micron", "wd1", "External", "micron.com", "Semiconductors"),
  wd("Adobe", "adobe", "wd5", "external_experienced", "adobe.com", "Software"),
  wd("HP", "hp", "wd5", "ExternalCareerSite", "hp.com", "Hardware"),
  wd("Workday", "workday", "wd5", "Workday", "workday.com", "Software"),
  wd("Disney", "disney", "wd5", "disneycareer", "disney.com", "Media"),
  wd("Accenture", "accenture", "wd103", "AccentureCareers", "accenture.com", "Consulting", true),
  wd("CarMax", "carmax", "wd1", "External", "carmax.com", "Retail Tech", true),
  sr("ServiceNow", "ServiceNow", "servicenow.com", "Software"),
  sr("Bosch", "BoschGroup", "bosch.com", "Hardware"),
  sr("Western Digital", "WesternDigital", "westerndigital.com", "Hardware"),

  // Security
  wd("CrowdStrike", "crowdstrike", "wd5", "crowdstrikecareers", "crowdstrike.com", "Security"),
  gh("Zscaler", "zscaler", "zscaler.com", "Security"),
  gh("SentinelOne", "sentinellabs", "sentinelone.com", "Security"),
  gh("Dragos", "dragos", "dragos.com", "Security"),
  gh("Huntress", "huntress", "huntress.com", "Security"),
  gh("Expel", "expel", "expel.com", "Security"),
  gh("Abnormal Security", "abnormalsecurity", "abnormalsecurity.com", "Security"),
  gh("HiddenLayer", "hiddenlayer", "hiddenlayer.com", "Security"),
  ab("1Password", "1password", "1password.com", "Security"),
  ab("Vanta", "vanta", "vanta.com", "Security"),
  ab("Drata", "drata", "drata.com", "Security"),
  ab("HackerOne", "hackerone", "hackerone.com", "Security"),
  gh("Okta", "okta", "okta.com", "Security"),

  // AI
  gh("Anthropic", "anthropic", "anthropic.com", "AI"),
  ab("OpenAI", "openai", "openai.com", "AI"),
  gh("Scale AI", "scaleai", "scale.com", "AI"),
  ab("Perplexity", "perplexity", "perplexity.ai", "AI"),
  ab("Cohere", "cohere", "cohere.com", "AI"),
  ab("Cognition", "cognition", "cognition.ai", "AI"),
  ab("Sierra", "sierra", "sierra.ai", "AI"),
  ab("Harvey", "harvey", "harvey.ai", "AI"),
  ab("ElevenLabs", "elevenlabs", "elevenlabs.io", "AI"),
  ab("Replit", "replit", "replit.com", "AI"),

  // Infrastructure, cloud, data
  gh("Databricks", "databricks", "databricks.com", "Data"),
  ab("Snowflake", "snowflake", "snowflake.com", "Data"),
  gh("Cloudflare", "cloudflare", "cloudflare.com", "Infrastructure"),
  gh("Datadog", "datadog", "datadoghq.com", "Infrastructure"),
  gh("MongoDB", "mongodb", "mongodb.com", "Data"),
  gh("Elastic", "elastic", "elastic.co", "Data"),
  gh("Fivetran", "fivetran", "fivetran.com", "Data"),
  ab("ClickHouse", "clickhouse", "clickhouse.com", "Data"),
  gh("CoreWeave", "coreweave", "coreweave.com", "Infrastructure"),
  ab("Crusoe", "crusoe", "crusoe.ai", "Infrastructure"),
  ab("Lambda", "lambda", "lambda.ai", "Infrastructure"),
  gh("GitLab", "gitlab", "gitlab.com", "Developer Tools"),
  gh("Vercel", "vercel", "vercel.com", "Developer Tools"),
  ab("Supabase", "supabase", "supabase.com", "Developer Tools"),
  ab("Sentry", "sentry", "sentry.io", "Developer Tools"),
  ab("Temporal", "temporal", "temporal.io", "Developer Tools"),
  gh("Grafana Labs", "grafanalabs", "grafana.com", "Developer Tools"),
  gh("Twilio", "twilio", "twilio.com", "Developer Tools"),
  ab("Linear", "linear", "linear.app", "Developer Tools"),
  ab("Notion", "notion", "notion.so", "Software"),
  gh("Figma", "figma", "figma.com", "Software"),
  gh("Asana", "asana", "asana.com", "Software"),
  gh("Dropbox", "dropbox", "dropbox.com", "Software"),
  gh("Samsara", "samsara", "samsara.com", "Hardware"),
  gh("Verkada", "verkada", "verkada.com", "Hardware"),
  ab("Benchling", "benchling", "benchling.com", "Software"),

  // Consumer
  gh("Airbnb", "airbnb", "airbnb.com", "Consumer"),
  gh("DoorDash", "doordashusa", "doordash.com", "Consumer"),
  gh("Instacart", "instacart", "instacart.com", "Consumer"),
  gh("Lyft", "lyft", "lyft.com", "Consumer"),
  gh("Pinterest", "pinterest", "pinterest.com", "Consumer"),
  gh("Reddit", "reddit", "reddit.com", "Consumer"),
  gh("Discord", "discord", "discord.com", "Consumer"),
  gh("Roblox", "roblox", "roblox.com", "Gaming"),
  gh("Twitch", "twitch", "twitch.tv", "Consumer"),
  gh("Duolingo", "duolingo", "duolingo.com", "Consumer"),

  // Space, hardware, deep tech
  gh("SpaceX", "spacex", "spacex.com", "Aerospace"),
  gh("Rocket Lab", "rocketlab", "rocketlabusa.com", "Aerospace"),
  gh("Relativity Space", "relativity", "relativityspace.com", "Aerospace"),
  ab("Skydio", "skydio", "skydio.com", "Aerospace"),
  gh("Flexport", "flexport", "flexport.com", "Logistics"),
  gh("IonQ", "ionq", "ionq.com", "Quantum"),
  gh("PsiQuantum", "psiquantum", "psiquantum.com", "Quantum"),
  gh("Tenstorrent", "tenstorrent", "tenstorrent.com", "Semiconductors"),
  gh("Lightmatter", "lightmatter", "lightmatter.co", "Semiconductors"),
];
