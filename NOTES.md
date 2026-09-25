#Notes

## Plan

- [x] Bootstrap and deploy to git and vercel
- [x] Static components to test project styles
- [x] Create script to merge data files
- [x] Create local seach for testing
- [x] Algolia account and index data
- [x] Algolia search component
- [x] Adjust data script to clean the data and reindex
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
- Cleanup runs as the last step of `data:build`, from `scripts/clean.mts`. The join stays faithful; every change to the data is in that one file.
- `phone` and `phone_number` are merged into `phones: [{ number, ext? }]` and the originals dropped. 4,905 records have one number, 95 have two.
- No country code stored — all 10,000 values are bare 10-digit NANP numbers.
- `food_type` is split into `cuisines: string[]` on `/` and `,`; the raw field is kept for display. Facet on `cuisines`.
- That split made Southwestern (36), Small Plates (42), Global (43), Latin (13) and Eclectic (30) facetable — they had no facet presence at all before.
- A cuisine hierarchy was tried and rejected: not derivable from the strings without judgement, and 116 values is a display problem, not a data one.
- Two of the three restaurants shown in their mockup ("Anchor and Hope", "Bluestem Brasserie") are not in our dataset — the screenshot was built from a different cut.

## Search

- Naive substring search over the merged JSON on /old
- Algolia implementation on root page

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
- `searchableAttributes` is ordered and restricted: name, cuisines+food_type, neighborhood+city, area, dining_style. Order drives the Attribute ranking criterion; commas mean equal weight.
- That took `restimages`, `single.aspx`, `opentable`, postal codes and phone digits from thousands of hits to 0, with every real query holding.
- `attributesToRetrieve` cut hits from 23 attributes to 9 (~34% smaller). An attribute stays searchable and facetable whether or not it is returned — three independent lists.
- Facets declared: cuisines, dining_style, price, area, neighborhood. The sidebar renders the first three.
- Multi-facet disjunctive faceting: 1 request for hits + 1 per facet with that facet's own filter removed, all batched into one round trip.
- Price facets and displays from the `price` integer, rendered $$ / $$$ / $$$$ — the same notation OpenTable's own filter uses. Filter and display from one field, so the 220 price conflicts can never show on screen.
- Star ratings restored on the result card — they were in their mockup and we had dropped them by accident.
- Client uses `algoliasearch/lite` (search-only, smaller bundle); its method is `searchForHits`, not `searchSingleIndex`.

## Look and feel

- Kept their visual identity — palette, Open Sans, background tile — rather than restyling, so that when the demo sits next to their screenshot every visible difference is behaviour, not decoration.
- Tokens live in `globals.css` as Tailwind 4 `@theme` variables.
- Every `image_url` redirects to a generic placeholder, so cards show one repeated icon. Host allowlisted in `next.config.ts`; real imagery needs substituting later.

## possible wins with algolia

- Order seach attributes
- Custom ranking by popularity_score
- Remove unused fields from payload.
- Synonyms by AE's "alternate spellings" note.
- Geo and ranking tension
- Investigate replica for sorting
- Always show a result: lastWords feature
- Create a rule for demo (detect a cuisine word in the query and apply it as a filter)
- Server facet ordering
- Query Suggestions
- "Click & conversion events via Insights" investigate
  Personalization or dynamic reranking need click and conversion data and this index has none
