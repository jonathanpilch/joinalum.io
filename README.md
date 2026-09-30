# joinalum.io

Alum: a school-specific explore board for internships and early career roles, in the style of [Runway's explore page](https://app.joinrunway.io/explore), dressed in Ndex's glass look (`NuBlock.co/public/app/glass.css`). Proof of concept.

What it adds over a general board: every role shows how many of the school's alumni work on that team, which employers recruit on campus, and filters for major and class year.

```
index.html    the page
styles.css   Ndex tokens (smoked campus photo, frosted panels, Satoshi, gold accent)
app.js        board, filters drawer, role detail, sign-in stub
schools.js    per-school config: name, demonym, mark, backdrop, majors, recruiters
data.js       seeded sample roles and alumni (not real)
assets/       Satoshi, the Nu mark, VT's mark and campus photo (copied from NuBlock.co)
```

## Run it

```
python3 -m http.server 5178
```

Then open http://localhost:5178. Another school: add it to `schools.js` and open `?school=<slug>`.

## Not wired up yet

Sign-in, match scores, apply links and referral requests are stubs. Roles and alumni come from `data.js`.
