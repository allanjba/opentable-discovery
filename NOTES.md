#Notes

## Plan

- [x] Bootstrap and deploy to git and vercel
- [x] Static components to test project styles
- [x] Create script to merge data files
- [x] Create local seach for testing
- [x] Algolia account and index data
- [x] Algolia search component
- [x] Adjust data script to clean the data and reindex
- [ ] Improve search experience (in progress: settings tuned, ranking done)

## Next — settings, in order

1. `minWordSizefor1Typo` — `Acme` returns **1,605 hits**. Typo tolerance is very permissive on short words.
2. `removeWordsIfNoResults: "lastWords"` — `pizza under 50` currently returns 0 because Algolia requires every query word to match.
3. Synonyms — `bbq`↔`barbecue`, `steak house`↔`steakhouse`.
4. One Rule with `automaticFacetFilters` — turn a price/cuisine phrase into a real filter.
5. Geo — `aroundLatLng` + three-tier fallback. Geo is 2nd in the ranking formula, so tune `aroundPrecision` or it tramples known-item search.
6. Replicas for sorting — sorting is index-level, not a query param. Virtual replicas give Relevant Sort but are plan-gated.
7. Tier 3: `renderingContent`, Query Suggestions index, Insights click/conversion events.

Deliberately NOT doing: NeuralSearch, AI Ranking, Personalization, Dynamic Re-ranking, Recommend — all need behavioural data this index doesn't have. Instrument the events instead and say why.

## UI, paired with the setting it needs

- Highlight matched text — `attributesToHighlight` (already returning `_highlightResult`, 49% of payload, currently unused)
- Facet search box for 116 cuisines — `searchable(cuisines)` already set
- Sort dropdown — replicas
- Booking link on card — needs `reserve_url` back in `attributesToRetrieve`
- No-results recovery — `removeWordsIfNoResults`
- "Near me" — `aroundLatLng`
- Autocomplete — Query Suggestions index

Pure UI, no setting: active filter chips + clear-all · empty-state discovery surface · replace "in 0.002 seconds" with something a diner cares about · responsive/mobile.

## Known issues

- **Intermittent empty facet sidebar on production.** Seen twice: hits correct (e.g. `stakehouse` → 423) but zero facet values, no console errors. Not reproducible on demand; local always works; the Algolia API returns facets correctly for those queries. Both occurrences were when the query changed very shortly after page load, which points at a race, but the effect already cancels stale responses so the mechanism isn't confirmed. **Demo risk — an empty sidebar mid-mock-call would be bad.** Worth pinning down before the interview.
- Algolia settings and search results are separately async: settings read back via `getSettings` well before live results agree, and during propagation different servers answer differently. Don't A/B a change immediately after making it.

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
- `popularity_score` is derived in `clean.mts`: a Bayesian average, `(v/(v+m))·R + (m/(v+m))·C`. `C` = 4.3786, the review-weighted corpus mean, computed at build time. `m` = 140, the p25 of review counts — a policy choice, so it stays a named constant with a reason. Rounded to 4 dp (2,720 distinct values).
- It exists because Algolia ranks on **stored** attributes — `customRanking` has no query-time scoring function, no `script_score`. That is the trade that buys single-digit-millisecond responses, and it makes any ranking signal the pipeline's job. Algolia's Data Transformations can host that at ingestion if a customer doesn't want to own it.
- Third time data work was the prerequisite for a search feature: cuisine faceting needed the `food_type` split, phones needed reconciling, ranking needed a signal the source doesn't have.
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
- `searchableAttributes` is ordered and restricted: cuisines+food_type, neighborhood+city, area, dining_style, **name last**. Order drives the Attribute ranking criterion; commas mean equal weight.
- `name` last is a measured trade-off, applied by Algolia's config assistant and kept. Gain: `italian` now returns restaurants that *serve* Italian (Pazza Notte, Vittoria) instead of ones with "Italian" in the name (Divino Italian Restaurant) — a naming convention, not a signal. Cost: single-word names colliding with a neighbourhood get buried — the restaurant named `Lafayette` is #14 of 19; `Rye` #5 of 7; `Babylon` #4 of 5. 758 names are single-word. Multi-word names unaffected (Wallsé, Sushi Yasaka, Mama's Fish House all #1).
- Which order is right depends on OpenTable's traffic mix, not on argument — a discovery question. Their own placeholder reads "by Name, Cuisine, Location". Algolia A/B tests this natively.
- **Settings drift is real.** The assistant wrote both changes straight to the index; `configure-index.mts` still said `name` first with no `customRanking`, so the next `data:settings` run would have silently reverted them. Script and dashboard are competing sources of truth — after any dashboard change, copy it into the script.
- That took `restimages`, `single.aspx`, `opentable`, postal codes and phone digits from thousands of hits to 0, with every real query holding.
- `attributesToRetrieve` cut hits from 23 attributes to 9 (~34% smaller). An attribute stays searchable and facetable whether or not it is returned — three independent lists.
- Facets declared: cuisines, dining_style, price, area, neighborhood. The sidebar renders the first three.
- Multi-facet disjunctive faceting: 1 request for hits + 1 per facet with that facet's own filter removed, all batched into one round trip.
- Price facets and displays from the `price` integer, rendered $$ / $$$ / $$$$ — the same notation OpenTable's own filter uses. Filter and display from one field, so the 220 price conflicts can never show on screen.
- Star ratings restored on the result card — they were in their mockup and we had dropped them by accident.
- `customRanking: ["desc(popularity_score)", "desc(reviews_count)"]`. Two entries because customRanking is a list of tie-breakers like the main formula — 2,280 records share a score at 4 dp.
- Measured before/after. Browsing 5,000 with no ranking: **The Edgewater Grill, 3.9★**, led on insertion order. With `desc(stars_count)`: 5.0★/3-review places in the top 5. With `popularity_score`: Russell's (4.9★/2,512), Quince (4.9★/1,693), Mama's Fish House (4.8★/12,669) at #6. Ellen's Cafe (5.0★, **1 review**) went from #1 to #2,391.
- Float precision on `customRanking` is preserved — 613 adjacent pairs in the top 1,000 differ by <0.001 with **zero** inversions, so no scaled integer is needed. Verified, not assumed.
- `popularity_score` is deliberately not in `attributesToRetrieve` — it's a ranking input, not a display value. Requested per-query in the verification script, which shows the index-level list is a default, not a cage.
- `ranking` is Algolia's default with **`exact` moved ahead of `attribute`**. A/B'd across 39 queries: exactly 2 changed (`Union` #29→#3, `Rye` #5→#4), 37 identical, no regressions.
- It promotes **exact over prefix**, not name over neighbourhood. It cannot break a tie *between* exact matches — `exact` counts exactly-matched words and doesn't know which attribute they came from. `getRankingInfo` shows the restaurant named Lafayette and all 22 in Lafayette neighbourhood/city all report `nbExactWords: 1`, so the tie still falls to `attribute`. **`Lafayette` is still #14 of 19.**
- The real fix for that is a UI answer, not a ranking one: a federated query showing "restaurants named X" and "restaurants in X" as separate groups rather than one ordering. Parked.
- A `ranking` change took **~125 seconds** to reach live search, and hit counts were briefly unstable while it settled. Measured, not guessed — three identical runs afterwards showed 0 of 39 queries drifting.
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
