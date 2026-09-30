/* Sample data for the proof of concept. Nothing here is real: the roles are
 * generated from a seeded list so the page looks the same on every load, and
 * the alumni are invented. Swap this file for a feed when there is one. */
(function () {
  let seed = 20260930;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const some = (a, n) => [...a].sort(() => rand() - 0.5).slice(0, n);

  // name, colour, industry, where they hire, how many alumni work there
  const companies = [
    ["Capital One", "#004977", "Finance", ["McLean, Virginia", "Richmond, Virginia", "New York, New York"], 1840],
    ["Deloitte", "#1a1a1a", "Consulting", ["Arlington, Virginia", "Washington, DC", "Charlotte, North Carolina"], 1310],
    ["Lockheed Martin", "#003a70", "Aerospace & Defense", ["Bethesda, Maryland", "Manassas, Virginia", "Fort Worth, Texas"], 1120],
    ["Northrop Grumman", "#0b2d5b", "Aerospace & Defense", ["Falls Church, Virginia", "Dulles, Virginia", "Linthicum, Maryland"], 980],
    ["Booz Allen Hamilton", "#10426b", "Consulting", ["McLean, Virginia", "Washington, DC"], 870],
    ["Amazon", "#232f3e", "Technology", ["Arlington, Virginia", "Seattle, Washington", "Herndon, Virginia"], 760],
    ["Microsoft", "#2f2f2f", "Technology", ["Reston, Virginia", "Redmond, Washington"], 540],
    ["EY", "#2e2e38", "Accounting", ["Tysons, Virginia", "Richmond, Virginia"], 610],
    ["PwC", "#a32020", "Accounting", ["Washington, DC", "Norfolk, Virginia"], 590],
    ["KPMG", "#00338d", "Accounting", ["McLean, Virginia", "Richmond, Virginia"], 480],
    ["Collins Aerospace", "#003b71", "Aerospace & Defense", ["Cedar Rapids, Iowa", "Charlotte, North Carolina"], 310],
    ["Dominion Energy", "#004b87", "Energy", ["Richmond, Virginia", "Glen Allen, Virginia"], 720],
    ["Newport News Shipbuilding", "#13294b", "Manufacturing", ["Newport News, Virginia"], 1030],
    ["Freddie Mac", "#1b3a6b", "Finance", ["McLean, Virginia"], 340],
    ["Carilion Clinic", "#00558c", "Healthcare", ["Roanoke, Virginia"], 890],
    ["Altria", "#1f3d7a", "Consumer Goods", ["Richmond, Virginia"], 400],
    ["CarMax", "#053361", "Retail", ["Richmond, Virginia", "Remote"], 520],
    ["Leidos", "#4b2a85", "Technology", ["Reston, Virginia", "Huntsville, Alabama"], 450],
    ["General Dynamics", "#1c2b39", "Aerospace & Defense", ["Falls Church, Virginia", "Groton, Connecticut"], 410],
    ["Boeing", "#0033a1", "Aerospace & Defense", ["Arlington, Virginia", "St. Louis, Missouri", "Seattle, Washington"], 380],
    ["BAE Systems", "#0b2340", "Aerospace & Defense", ["Falls Church, Virginia", "Nashua, New Hampshire"], 260],
    ["Accenture", "#7500c0", "Consulting", ["Arlington, Virginia", "Atlanta, Georgia"], 670],
    ["Truist", "#2e1a47", "Finance", ["Charlotte, North Carolina", "Richmond, Virginia"], 430],
    ["Stripe", "#635bff", "Technology", ["Remote", "San Francisco, California"], 42],
    ["Palantir", "#101113", "Technology", ["Washington, DC", "New York, New York"], 95],
    ["Moog", "#003865", "Manufacturing", ["Blacksburg, Virginia", "East Aurora, New York"], 150],
    ["Rackspace", "#c40022", "Technology", ["Blacksburg, Virginia", "Remote"], 120],
    ["Volvo Group", "#1f3b73", "Manufacturing", ["Dublin, Virginia", "Greensboro, North Carolina"], 210],
    ["Gensler", "#d6001c", "Architecture", ["Washington, DC", "New York, New York"], 85],
    ["HDR", "#00467f", "Engineering", ["Norfolk, Virginia", "Omaha, Nebraska"], 180],
    ["Kimley-Horn", "#6b1f28", "Engineering", ["Raleigh, North Carolina", "Richmond, Virginia"], 240],
    ["Hilton", "#104c97", "Hospitality", ["McLean, Virginia", "Memphis, Tennessee"], 190],
    ["Navy Federal Credit Union", "#003366", "Finance", ["Vienna, Virginia", "Pensacola, Florida"], 360],
    ["Anduril", "#111111", "Aerospace & Defense", ["Costa Mesa, California", "Washington, DC"], 38],
    ["Pfizer", "#0093d0", "Healthcare", ["New York, New York", "Remote"], 110],
  ];

  // title, function, majors it fits
  const cs = ["Computer Science", "Computer Engineering", "Statistics"];
  const biz = ["Finance", "Accounting & Information Systems", "Business Information Technology", "Economics"];
  const eng = ["Mechanical Engineering", "Aerospace Engineering", "Industrial & Systems Engineering"];
  const roles = {
    Technology: [["Software Engineer", "Software", cs], ["Data Analyst", "Data", ["Statistics", "Business Information Technology", "Economics"]], ["Cloud Engineer", "Software", cs], ["Product Manager", "Product", ["Computer Science", "Business Information Technology", "Marketing"]], ["Machine Learning Engineer", "Data", cs], ["Security Engineer", "Software", cs]],
    Finance: [["Financial Analyst", "Finance", biz], ["Data Scientist", "Data", ["Statistics", "Computer Science", "Economics"]], ["Software Engineer", "Software", cs], ["Risk Analyst", "Finance", biz], ["Business Analyst", "Consulting", ["Business Information Technology", "Finance", "Industrial & Systems Engineering"]]],
    Consulting: [["Technology Consultant", "Consulting", ["Business Information Technology", "Computer Science", "Industrial & Systems Engineering"]], ["Business Analyst", "Consulting", biz], ["Cyber Risk Analyst", "Consulting", cs], ["Strategy Analyst", "Consulting", ["Economics", "Finance"]]],
    Accounting: [["Audit Associate", "Accounting", ["Accounting & Information Systems"]], ["Tax Associate", "Accounting", ["Accounting & Information Systems", "Finance"]], ["Risk Assurance Associate", "Accounting", biz]],
    "Aerospace & Defense": [["Systems Engineer", "Engineering", eng.concat(["Computer Engineering"])], ["Mechanical Engineer", "Engineering", ["Mechanical Engineering", "Aerospace Engineering"]], ["Embedded Software Engineer", "Software", ["Computer Engineering", "Computer Science"]], ["Supply Chain Analyst", "Operations", ["Industrial & Systems Engineering", "Business Information Technology"]], ["Program Finance Analyst", "Finance", biz]],
    Energy: [["Electrical Engineer", "Engineering", ["Computer Engineering"]], ["Energy Analyst", "Finance", ["Economics", "Finance"]], ["Project Engineer", "Engineering", ["Civil Engineering", "Mechanical Engineering"]]],
    Manufacturing: [["Manufacturing Engineer", "Engineering", ["Industrial & Systems Engineering", "Mechanical Engineering"]], ["Design Engineer", "Engineering", eng], ["Quality Engineer", "Engineering", ["Industrial & Systems Engineering"]], ["Software Engineer", "Software", cs]],
    Healthcare: [["Clinical Research Assistant", "Healthcare", ["Biological Sciences", "Psychology"]], ["Patient Experience Coordinator", "Healthcare", ["Psychology", "Communication"]], ["Health Data Analyst", "Data", ["Statistics", "Biological Sciences"]]],
    "Consumer Goods": [["Brand Marketing Associate", "Marketing", ["Marketing", "Communication"]], ["Sales Analyst", "Sales", ["Marketing", "Economics"]], ["Supply Chain Analyst", "Operations", ["Industrial & Systems Engineering"]]],
    Retail: [["Software Engineer", "Software", cs], ["Marketing Analyst", "Marketing", ["Marketing", "Statistics"]], ["Product Analyst", "Product", ["Business Information Technology", "Economics"]]],
    Architecture: [["Architectural Designer", "Design", ["Architecture"]], ["Interior Design Intern", "Design", ["Architecture"]]],
    Engineering: [["Civil Engineer", "Engineering", ["Civil Engineering"]], ["Transportation Engineer", "Engineering", ["Civil Engineering"]], ["Structural Engineer", "Engineering", ["Civil Engineering", "Architecture"]]],
    Hospitality: [["Revenue Analyst", "Finance", ["Finance", "Economics"]], ["Corporate Communications Associate", "Marketing", ["Communication", "Marketing"]]],
  };

  const types = [["Internship", 0.55], ["Full-time", 0.35], ["Co-op", 0.1]];
  const weighted = (list) => { let r = rand(); for (const [v, w] of list) { if ((r -= w) < 0) return v; } return list[0][0]; };
  const seasons = ["Summer 2027", "Spring 2027", "Fall 2027"];

  const first = ["Maya", "Ethan", "Priya", "Jordan", "Sam", "Grace", "Luis", "Hannah", "Kevin", "Aisha", "Tyler", "Emma", "Noah", "Zoe", "Ben", "Olivia", "Marcus", "Chloe", "Ryan", "Nina", "Owen", "Leah", "Dev", "Abby"];
  const last = ["Patel", "Nguyen", "Brooks", "Kim", "Carter", "Reyes", "Hughes", "Shah", "Lopez", "Walsh", "Chen", "Foster", "Ali", "Murphy", "Tran", "Bennett", "Rao", "Price", "Diaz", "Fischer"];

  const jobs = [];
  const count = 140;
  for (let i = 0; i < count; i++) {
    const [company, color, industry, cities, alumniTotal] = pick(companies);
    const [base, fn, majors] = pick(roles[industry]);
    const type = weighted(types);
    const title = type === "Internship" ? `${base} Intern, ${pick(seasons)}` : type === "Co-op" ? `${base} Co-op` : base.includes("Intern") ? base : `${pick(["", "", "Associate ", "Entry Level "])}${base}`;
    const location = pick(cities);
    const arrangement = location === "Remote" ? "Remote" : weighted([["On-site", 0.55], ["Hybrid", 0.4], ["Remote", 0.05]]);
    // Freshest first: a curve that crowds most posts into the last day.
    const minutesAgo = Math.floor(Math.pow(rand(), 2.4) * 60 * 24 * 21);
    // Alumni on this team -- a slice of the company's total.
    const onTeam = Math.max(0, Math.round(alumniTotal * (0.004 + rand() * 0.02)));
    const alumni = Array.from({ length: Math.min(onTeam, 4) }, () => ({
      name: `${pick(first)} ${pick(last)}`,
      year: 2012 + Math.floor(rand() * 14),
      major: pick(majors),
      title: pick([base, `Senior ${base}`, `${base} II`, "Engineering Manager", "Recruiter"].filter(Boolean)),
    }));
    jobs.push({
      id: `r${i}`,
      title: title.replace(/\s+/g, " ").trim(),
      company, color, industry, location, arrangement, type, fn, majors,
      classYears: type === "Full-time" ? ["2026", "2027"] : ["2027", "2028", "2029"],
      minutesAgo,
      alumniTotal,
      onTeam,
      alumni,
      pay: type === "Full-time" ? `$${70 + Math.floor(rand() * 60)}k–$${110 + Math.floor(rand() * 60)}k` : `$${22 + Math.floor(rand() * 26)}/hr`,
    });
  }
  jobs.sort((a, b) => a.minutesAgo - b.minutesAgo);
  window.JOBS = jobs;
})();
