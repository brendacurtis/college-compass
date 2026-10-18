# College Compass

A free, no-login college search, PDF profile, and application tracker site for families — built on the U.S. Department of Education's [College Scorecard](https://collegescorecard.ed.gov) dataset.

This is a **static site**: plain HTML/CSS/JavaScript with pre-built data files. There is no server, no database, and no accounts — it can be hosted for free almost anywhere, and a family's application tracker is saved only in their own browser (`localStorage`), never uploaded anywhere.

## What's in here

```
site/
  index.html        Search & filter homepage
  build-list.html        Build My List: GPA/test score + counts per category -> balanced list and odds matrix
  chances.html        Find My Schools: browse every school by reach/high target/target/safety
  diversity.html        Diversity Search — min % by race/ethnicity group, Diversity Index sort
  school.html        Individual school profile page (reads ?id=<UNITID>)
  tracker.html        Family's application tracker (localStorage only)
  about.html          Data source & methodology
  css/style.css        All styling
  js/app.js         Shared helpers + tracker storage logic
  js/search.js        Homepage search/filter logic
  js/listbuilder.js        Build My List: chance model, categories, list picker, odds matrix
  js/model.js        Shared chance model, categories, home-state adjustment (used by both list pages)
  js/geo.js        ZIP code -> distance helpers (reads data/zips.txt and data/geo.json)
  js/chances.js        Find My Schools page logic
  js/diversity.js        Diversity Search filter/sort logic
  js/school.js        School detail page logic
  js/tracker.js        Tracker page logic
  data/schools.json      Compact list of all 2,207 schools (search/filter)
  data/details/<id>.json   Full profile per school (fetched on demand)
  data/meta.json        Build metadata
  data/geo.json        School coordinates (built by scripts/build_geo.py)
  data/zips.txt        ZIP code coordinates (U.S. Census 2024 ZCTA Gazetteer; built by scripts/build_geo.py)
  pdfs/<id>.pdf        One downloadable PDF profile per school
```

The `<id>` in each case is the school's federal UNITID (the same ID College Scorecard uses — e.g. Yale University is `130794`, so its page is `school.html?id=130794` and its PDF is `pdfs/130794.pdf`).

## Viewing it locally

You need Python installed (you already have it, since it built this data). From the `site` folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser. (Opening `index.html` directly by double-clicking won't work — browsers block the `fetch()` calls this site needs when loaded from a `file://` path.)

## Publishing it for free (no coding required)

**Easiest option — Netlify Drop:**
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop) in your browser.
2. Drag the whole `site` folder onto the page.
3. Netlify gives you a live public URL in about 30 seconds. Create a free account (optional but recommended) to keep the URL permanently and get a nicer address.

**Alternative — GitHub Pages** (if you already have or want a GitHub account):
1. Create a new repository on [github.com](https://github.com), e.g. `college-compass`.
2. This folder is already a git repository with one commit — from a terminal in this `site` folder, run:
   ```bash
   git remote add origin https://github.com/<your-username>/college-compass.git
   git branch -M main
   git push -u origin main
   ```
3. In the repository's Settings → Pages, set the source to the `main` branch, root folder. GitHub gives you a URL like `https://<your-username>.github.io/college-compass/`.

Either way — once it's live, you can send parents the link. No app store, no server bill, no login system to maintain.

## Updating the data (e.g., next year's College Scorecard release)

The site's content is generated from the raw College Scorecard CSV by two scripts that live in `../scripts/` (one level up from this `site` folder):

1. Download the new "Most Recent Cohorts (Institution)" CSV from [collegescorecard.ed.gov/data](https://collegescorecard.ed.gov/data/).
2. Update the `CSV_PATH` at the top of `scripts/build_data.py` to point to the new file.
3. From the project root, run:
   ```bash
   python scripts/build_data.py
   python scripts/generate_pdfs.py
   ```
4. This regenerates everything in `site/data/` and `site/pdfs/`. Commit and re-push (or re-drag to Netlify) to publish the update.

If you're not comfortable doing this yourself, just hand these two scripts and the new CSV to Claude Code again and ask it to re-run the pipeline — it's a two-minute job.

## Scope note

The dataset here is filtered to **2,207 currently-operating, four-year, primarily degree-granting institutions** (public, private nonprofit, and private for-profit). Two-year colleges, certificate-only schools, and closed institutions are excluded to keep search results focused on traditional four-year admissions. See `about.html` for the full methodology notes shown to site visitors.
