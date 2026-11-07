# Pocket Rules

A personal, offline-capable pinball rulebook for your phone. Rulesheets are scraped from
[Pinball Rule Sheets](https://pinballrulesheets.com) and [Pinball Primer](https://pinballprimer.github.io)
into static JSON, and a small React app (installable to the home screen) displays them.

## Commands

```bash
npm run scrape              # fetch new pages (cached in scraper/.cache) and rebuild public/data
npm run scrape -- --refresh # re-download every page to pick up rulesheet edits
npm run dev                 # local dev server at http://localhost:5173
npm run build               # production build into dist/
```

`node scraper/try.js prs <url>` (or `primer <url>`) prints how one page gets split into sections,
which is handy when a rulesheet parses badly. `scraper/report.txt` lists pages that failed or came out thin.

## How it fits together

- `scraper/sources/*.js` – one module per site: `list()` returns the catalog, `page(url)` the content HTML.
- `scraper/sectionize.js` – splits content into a section tree, sanitizes it, and tags `(Pro)` / `(Prem/LE)` markers.
  The heading heuristics come from the Discord bot's `/rules` command.
- `scraper/build.js` – merges the same game across sources and writes `public/data/index.json` + `public/data/m/<id>.json`.
- `src/` – the app. Hash routes: `#/` (list) and `#/m/<id>/<section>`.

Kineticist and Pinside block automated requests, so the app only links to them.
