#Notes

## Plan

- [x] Bootstrap and deploy to git and vercel
- [x] Static components to test project styles
- [x] Create script to merge data files
- [x] Create local seach for testing
- [x] Algolia account and index data
- [x] Algolia search component
- [ ] Adjust data script to clean the data and reindex
- [ ] Improve search experience

## Setup

- Separate public
- Next.js 16 + TypeScript + Tailwind 4. Tailwind 4 configures in CSS via `@theme`; no config file.
- Scripts will be `.mts`, run natively by Node 24 — no build step for tooling.

## Links

- Repo: https://github.com/allanjba/opentable-discovery (public)
- Live: https://opentable-discovery.vercel.app
- CICD to Vercel project `opentable-discovery` imported from GitHub, so every push to `main` auto-deploys.

## Data

- Source files copied to `data/source/` untouched; no transformations yet.
- `npm run data:build` merges them into `public/data/restaurants.json`. Run manually, output is committed — no build-time generation.
- Output is a faithful superset: the source JSON record unchanged, plus 7 CSV fields. Verified across all 5,000 — zero drift.
- `objectID` stays a number, as the source has it. If Algolia needs a string, that belongs in the indexer, not the merge.
- Types are converted once, at the CSV boundary. CSV is typeless so numbers are parsed on read; fields that already had a type in the JSON are passed through untouched.
- The join reports failures in both directions — JSON record with no CSV row, and CSV row nobody claimed. The second is the silent one.
- Known: parser counts a phantom row from the file's trailing newline, so it reports 5001 rows and 1 orphan. Output is unaffected (5,000 records, no corruption); fix is `text.trim().split()`.
- Two of the three restaurants shown in their mockup ("Anchor and Hope", "Bluestem Brasserie") are not in our dataset — the screenshot was built from a different cut.

## Search

- Naive substring search over the merged JSON

## Algolia

- `algoliasearch` v5 — flat client, `algoliasearch(appId, key)` then `client.saveObjects({...})`. No `initIndex()`; that was v4, which is what the starter template pinned.
- Index name `restaurants`. `npm run data:index` pushes all 5,000, re-runnable — records match on objectID so a re-run replaces rather than duplicates.
- `npm run search:compare` runs the same queries against naive and Algolia side by side. Re-run it after any settings change; that is the tuning evidence.
- Env is read with Node 24's native `process.loadEnvFile()` — no dotenv dependency.
- We send `objectID` as a number; Algolia coerces it to a string. Confirmed on read-back.
- Indexed with **no settings at all** except `attributesForFaceting` (the sidebar cannot render without facet counts) and `maxValuesPerFacet: 200` (114 cuisines > the default 100 cap).
- `npm run data:settings` is the source of truth for settings — change the script, not the dashboard.
- `/` is Algolia, `/old` is the naive version, kept for side-by-side comparison.
- Search is undebounced. Algolia's docs frame debouncing as something you turn ON for slow networks, not the default.
- The sidebar needs **two** queries batched into one request — one for hits with the filter, one for facet counts without it. Otherwise selecting a cuisine zeroes every other cuisine and multi-select breaks (disjunctive faceting).
- Client uses `algoliasearch/lite` (search-only, smaller bundle); its method is `searchForHits`, not `searchSingleIndex`.

## Look and feel

- Kept their visual identity — palette, Open Sans, background tile — rather than restyling, so that when the demo sits next to their screenshot every visible difference is behaviour, not decoration.
- Tokens live in `globals.css` as Tailwind 4 `@theme` variables.
- Every `image_url` redirects to a generic placeholder, so cards show one repeated icon. Host allowlisted in `next.config.ts`; real imagery needs substituting later.
