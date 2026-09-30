/* Per-school config. The page is the same for every school; only this varies:
 * who the students are called, the campus photo, the mark, the majors the
 * filters offer, and which employers recruit on campus. Pick with ?school=slug. */
window.SCHOOLS = {
  vt: {
    slug: "vt",
    name: "Virginia Tech",
    shortName: "VT",
    demonym: "Hokies",
    domain: "vt.edu",
    mark: "assets/brand/vt.svg",
    markAspect: 1.714,
    backdrop: "assets/brand/vt-backdrop.jpg",
    primary: "#861F41",
    accent: "#E5751F",
    students: 38000,
    alumni: 290000,
    majors: [
      "Computer Science",
      "Computer Engineering",
      "Mechanical Engineering",
      "Industrial & Systems Engineering",
      "Aerospace Engineering",
      "Civil Engineering",
      "Finance",
      "Accounting & Information Systems",
      "Business Information Technology",
      "Marketing",
      "Economics",
      "Biological Sciences",
      "Psychology",
      "Communication",
      "Architecture",
      "Statistics",
    ],
    // Employers at VT's career fairs. The "Recruits at VT" filter reads this.
    recruiters: [
      "Capital One", "Deloitte", "Lockheed Martin", "Northrop Grumman", "Booz Allen Hamilton",
      "Amazon", "Microsoft", "EY", "PwC", "KPMG", "Collins Aerospace", "Dominion Energy",
      "Newport News Shipbuilding", "Freddie Mac", "Carilion Clinic", "Altria", "CarMax",
      "Leidos", "General Dynamics", "Boeing", "BAE Systems", "Accenture", "Truist",
    ],
  },
};
