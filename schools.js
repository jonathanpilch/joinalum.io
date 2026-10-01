/* Per-school config. The page is the same for every school; only this varies:
 * who the students are called, the campus photo, the mark. Which employers
 * count as this school's pipeline lives in ingest/companies.mjs. Pick with
 * ?school=slug. */
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
  },
};
