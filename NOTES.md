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

1. `removeWordsIfNoResults: "lastWords"` — `pizza under 50` currently returns 0 because Algolia requires every query word to match.
2. One Rule with `automaticFacetFilters` — turn a price/cuisine phrase into a real filter.
3. Replicas for sorting — sorting is index-level, not a query param. Virtual replicas give Relevant Sort but are plan-gated.
4. Tier 3: `renderingContent`, Query Suggestions index, Insights click/conversion events.

Deliberately NOT doing: NeuralSearch, AI Ranking, Personalization, Dynamic Re-ranking, Recommend — all need behavioural data this index doesn't have. Instrument the events instead and say why.

## UI, paired with the setting it needs

- ~~Highlight matched text~~ — done, via InstantSearch `<Highlight>`
- ~~Facet search box for 116 cuisines~~ — **rejected.** One search box is enough; the autocomplete's Food Type section covers finding a cuisine. Two inputs on one screen is worse, not better.
- Sort dropdown — replicas
- Booking link on card — needs `reserve_url` back in `attributesToRetrieve`
- No-results recovery — `removeWordsIfNoResults`
- ~~"Near me"~~ — done, opt-in distance search
- ~~Autocomplete~~ — done, InstantSearch `<Autocomplete>` over three indices. A Query Suggestions index would add a "popular searches" section, but it's built from analytics we don't have.

Pure UI, no setting: active filter chips + clear-all · empty-state discovery surface · replace "in 0.002 seconds" with something a diner cares about · responsive/mobile.

## Known issues

- **Intermittent empty facet sidebar on production.** Seen twice: hits correct (e.g. `stakehouse` → 423) but zero facet values, no console errors. Not reproducible on demand; local always works; the Algolia API returns facets correctly for those queries. Both occurrences were when the query changed very shortly after page load, which points at a race, but the effect already cancels stale responses so the mechanism isn't confirmed. **Demo risk — an empty sidebar mid-mock-call would be bad.** Worth pinning down before the interview.
- Algolia settings and search results are separately async: settings read back via `getSettings` well before live results agree, and during propagation different servers answer differently. Don't A/B a change immediately after making it.

## Demo controls

- `Ctrl+Shift+D` or `/?demo` opens the panel · `Esc` closes. Ctrl not Cmd — `Cmd+Shift+D` is bookmark-all-tabs in Chrome.
- Holds the **search-origin override** (New York · San Francisco · Denver · Miami — the four with real coverage, plus "use my real location") and the **link to `/old`**.
- Nothing in it is a product feature, and that's the rule: a prototype is read as a *proposal*, so every control on the page is a claim about what the product should do. Anything that exists only for our convenience goes here. The page itself now shows no demo affordances at all.

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
- **UI is React InstantSearch** (`react-instantsearch` + `react-instantsearch-nextjs`), migrated from a hand-rolled query layer. Algolia's own docs recommend the library; hand-rolling it was worth doing once, to learn what it does.
- Deleted in the migration: the disjunctive-faceting batching, the paging counter, the stale-response guards, the pinning of selected facet values. `RefinementList` defaults to `sortBy: ['isRefined','count:desc','name:asc']`, so pinning is the library's default.
- Parity verified: browse still 3 hits · `italian` 874 in the same order · Italian + Contemporary Italian = 850 + 19 = **869**, so OR semantics hold · price still `$$`/`$$$`/`$$$$` via `transformItems`.
- `<Stats>` renders a single string, so the two-part result line uses the `useStats` hook instead. Every widget has a hook — that's the escape hatch when markup matters. Note its `processingTimeMS` is Algolia's *server* time, so the number is now smaller than the hand-rolled one, which included network latency.
- `attributesToHighlight` restricted to `name`, `food_type`, `neighborhood` — it was defaulting to all searchable attributes at 49% of payload with nothing rendering it. Algolia's guide is explicit that this belongs to the index, not to InstantSearch.
- Don't hand-parse `_highlightResult`: Algolia wraps matches in `<em>` but does **not** escape the rest — `Kingfisher <em>Bar</em> & <em>Grill</em>`, raw ampersand. 438 names contain `&`. `<Highlight>` splits into parts and renders text nodes, so nothing is HTML-parsed.
- **`/` is now server-rendered on demand, not static.** `InstantSearchNext` forces it — and buys real SSR: restaurant names, counts and facets are all in the initial HTML. Previously the page was an empty shell until JS loaded. For a listings site that's an SEO win, so the trade is worth taking.
- Two **derived indices** feed the autocomplete: `locations` (1,269 rows) and `cuisines` (116). Built by `npm run data:suggest` from `restaurants.json` — no new information, just the restaurant data aggregated.
- They exist because `<Autocomplete>` renders *hits*, one index per section. A facet-value lookup can't be a section, and couldn't carry a `kind`, a display label or its own ranking anyway.
- Locations merge by label, broadest kind wins (area > city > neighborhood). 2,029 raw rows → 1,269: **759 labels are more than one kind** ("San Diego" is a city, a neighbourhood *and* an area). Unmerged, the dropdown shows the same place three times.
- `restaurant_count` is the **union** across all three location fields, not the count for the field it was filed under — because selecting a suggestion runs a plain text search and Algolia searches all three. Verified against real searches: San Diego 285/285, SE Portland 20/20, Portland / Oregon 197/197, Chelsea 41/41.
- Both indices rank `desc(restaurant_count)`, so `portland` gives Portland (117) and Portland / Oregon (197) above North Portland (5).
- `replaceAllObjects`, not `saveObjects` — these are fully derived, so a label that leaves the source has to leave here. It waits internally and its default scopes preserve settings across the swap.
- **Data-quality find:** city `"Portlando"` — one restaurant (Cerulean, Pearl District, zip 97209, state OR). Invisible in a 5,000-row list, obvious the moment you aggregate the field. Kept, not silently corrected, consistent with the phone and price conflicts. A suggestions index is a free data-quality audit.
- `salt lak` returns nothing and that is correct — **there is no Utah in this dataset** (35 states, no UT). Checked rather than chased.
- Gotcha: `paginationLimitedTo` defaults to **1,000**, so paging through an index silently stops there. Use `browseObjects` to read everything — it truncated a verification before I noticed.
- **Grouped autocomplete** — `<Autocomplete>` over three indices: Restaurants (main index, `restrictSearchableAttributes: ["name"]`), Locations, Food Type. Empty sections hide themselves. Keyboard nav, ARIA combobox and a mobile full-screen mode all come with the widget.
- It dissolves the `Lafayette` problem instead of tuning around it: "restaurants named X" and "places called X" are separate sections, so the user disambiguates at selection and no ranking has to choose.
- Selecting a suggestion sets the query and runs an ordinary search — **no filter**. Filters stay in the sidebar. Works because every suggestion is text the index already searches well.
- Four gotchas, all found by testing rather than reading: (1) `ItemComponent` must wire `onClick={onSelect}` itself — without it rows hover and do nothing; (2) supplying the top-level `onSelect` **replaces** the widget's handler, so you must call `setQuery` yourself or selection silently no-ops; (3) that prop's type is a union with the DOM `onSelect` from `ComponentProps<'div'>`, so it needs narrowing; (4) the panel closes by going `aria-hidden`, and `instantsearch.css` does the actual hiding — styling with Tailwind instead means driving `hidden` off `aria-hidden:hidden` yourself.
- **Counts are measured, not derived.** Each label is queried against the restaurants index at build time (1,385 labels, batches of 50, ~28 requests). A locally derived count lies: `Sushi` has 67 in `cuisines` but the search returns 106, because **39 restaurants named "Sushi …" are filed under food_type Japanese**. Same shape for Steakhouse (328 vs 421) and French (167 vs 248) — the names know more than the cuisine field.
- Counted with `typoTolerance: false`, because choosing a suggestion is choosing a literal string. It also keeps counts sane: typo-tolerant, `Acme` measures 1,605 against a real 3 and would outrank New York / Tri-State Area. Strict matches the source field for 1,012 of 1,275 labels vs 814.
- Promise vs delivery now: **1,047 of 1,385 exact (75.6%)**, and 239 of the remaining 338 are within 5. The big gaps are all typo tolerance — see roadmap item 1.
- `minWordSizefor1Typo: 5` (default 4), so four-letter words must match exactly. **`Acme` 1,605 → 3 · `Hilo` 252 → 1 · `Napa` 239 → 8 · `Vail` 355 → 27**, while `stakehouse` (423), `Wallse` (1), `restaurnt` (564), `italian` (874) and `sushi` (106) are all untouched — real typo tolerance survives intact. Propagated in ~6s, unlike the ~125s a `ranking` change took.
- Side effect: suggestion promise-vs-delivery went **75.6% → 79.5%** exact.
- Not chased, deliberately (mock project, one worked example): the remaining gaps are 5+ letter words that still get a typo. The good one to mention is **`Coronado` → 374, because at 8 letters it gets *two* typos and matches "Colorado"**. That's `minWordSizefor2Typos`, and in a real engagement you'd A/B it against traffic rather than guess.
- **Synonyms** live in `scripts/synonyms.mts` and are applied to all three indices. Five entries, `replaceExistingSynonyms: true` so the file is the source of truth.
- `bbq` ⇄ `barbecue` ⇄ `bar-b-q` (two-way): **4 → 26**. The only alternate *spelling* this data needs.
- `nyc` / `sf` / `nola` → the full city name (one-way): **15 → 1,415**, **5 → 264**, **4 → 94**. One-way verified: `new york` stayed at 1,415, not broadened in reverse.
- More useful than the list is what was **measured as unnecessary and left out**: `steak house`↔`steakhouse` (442/421, both already work — it was on the roadmap from day one and would have been dead weight), `barbeque` (typo tolerance covers it), `burger`/`burgers` (plurals), `tapas`/`small plates` (the cuisine split already links them), `vegas`/`Las Vegas`. Rejected after measuring: `la` (493 hits, two letters, too noisy) and `vegan`→`vegetarian` (one vegetarian restaurant, and `vegan` already mis-matches Las Vegas).
- **Synonyms are per-index.** Applying them to `restaurants` only shipped a visible bug: `nyc` returned 1,415 restaurants while the autocomplete's Locations section stayed empty, because the `locations` index had never heard the word. One shared list, applied to all three — a synonym only fires when its term appears, so sharing costs nothing.
- `new york city` → `new york` (one-way). The catalogue stores the city as "New York" and Algolia requires every query word to match, so the extra word sent the search to the 30 restaurants with "City" in their name. **30 → 1,415.** Note `removeWordsIfNoResults` would *not* have fixed this — it only fires at zero results, and this returned 30.
- **Geo is on by default** — location is requested on load. Reversed from an earlier opt-in position. What makes it safe is `aroundPrecision`: at 2 km buckets, nearby ordering is a *tie-break*, not an override, so relevance and popularity still decide within a neighbourhood. It also answers a pain point from the brief directly — *"chains have multiple locations in the same city, making it hard to identify the correct one"* — where nearest-first is the answer.
- A denial is not an error state: no distances, ranking untouched, nothing said. `<Configure>` is rendered only when an origin exists, so omitting it restores previous behaviour exactly.
- **Browser geolocation, not `aroundLatLngViaIP`** — and the reason is our own SSR. Algolia's docs are explicit that a server-side request geolocates to the *server* unless you forward `X-Forwarded-For`; since `/` is server-rendered, IP-based would silently centre every search on our Vercel region.
- `aroundRadius: "all"` sorts by distance without filtering. A fixed radius would return **zero** results from anywhere uncovered.
- `aroundPrecision: 2000` — 2 km buckets, so restaurants in the same neighbourhood tie on Geo and fall through to relevance and `popularity_score`. Visible in the demo: from New York the top three are 1.5 / 0.5 / 1.9 km, ordered by reviews (4,777 → 1,762 → 1,105), not by distance. At the 10 m default, distance alone would order everything and popularity would never get a say.
- Distance comes from `_rankingInfo.matchedGeoLocation.distance` (`getRankingInfo`, only while geo is on) — no client-side haversine, and no need to retrieve `_geoloc` on every hit.
- **Coverage is patchy and the UI says so.** Within 10 km: New York 770, Denver 137, San Francisco 127, Miami 32, LA 9. **Zero** for Atlanta (nearest 167 km), Chicago (116), Boston (123), Seattle (220), Salt Lake City (207), Paris (5,608), London (5,328). Of Algolia's five offices only NYC and SF have data.
- So when the nearest hit is >50 km, a notice states the distance. Turns a feature that looks broken into a coverage finding — *the search is correct, the inventory is not there* — which is the more useful conversation.
- That notice **branches on whether the user is searching or browsing**, because two different facts wear the same shape. Browsing from SLC, "no inventory near you" is true. But searching `New York` from Miami also puts the first hit 1,676 km away, and claiming "no inventory near Miami" from that is false — Miami has 32 restaurants within 10 km. Only the browsing case can say anything about coverage; the searching case says *nothing matching "New York" near Miami*.
- Watchdog on the location request: `getCurrentPosition`'s own `timeout` does **not** cover the permission prompt — Chrome doesn't start counting until you answer. An ignored prompt pinned the UI in "requesting" forever. 12s fallback, and a late fix still wins.
- All 5,000 records have valid `_geoloc` already in Algolia's expected shape.
- **Infinite scroll** via `useInfiniteHits` + an IntersectionObserver sentinel. InstantSearch has no auto-loading widget — `<InfiniteHits>` gives you a button and stops — and the hook-plus-sentinel is Algolia's own documented pattern.
- Non-obvious bit: an IntersectionObserver only fires when an element **crosses** the threshold. If a page is short enough that the sentinel is still on screen afterwards, no second event arrives and the list stalls. The observer is rebuilt after each page so it re-fires while the sentinel stays visible — fills the viewport, then stops.
- `rootMargin: 400px` starts the next page before the sentinel is actually visible.
- Ceiling: `paginationLimitedTo` defaults to **1,000** hits and Algolia warns that raising it slows search. It degrades gracefully — `isLastPage` just goes true there.
- **One page size (10) everywhere.** The 3-result browse teaser could not survive infinite scroll: the sentinel is on screen at first paint, so a second page loads before anyone sees three. Keeping it only meant 5 round trips for 15 results.
- Search bar and sidebar are `sticky`, rather than an inner scroll container. One scrollbar, the observer keeps its default viewport root, and no nested-scroll behaviour to go wrong on touch. `self-start` on the sidebar matters — a flex child stretches to the row height by default, and a full-height element has nothing to stick to. Sticky is `sm:`-only, so mobile keeps normal flow.
- Also fixed in passing: a real no-results state (the InstantSearch migration had dropped it) and "1 **results** found".
- **The autocomplete's Restaurants section is distance-aware too.** Each index in `<Autocomplete>` has its own `searchParameters` and does **not** inherit the page's `<Configure>`, so the geo params are passed explicitly — better anyway, since the dropdown can be tuned separately.
- Same query, different origin: `steak` from Denver offers Prime Steakhouse, **Ruth's Chris - Denver**, Morton's - Denver, LoHi Steakbar. From New York: Bobby Van's, Liberty Prime, Staghorn, Frankie & Johnnie's. That Ruth's Chris line is the brief's third pain point — *"chains have multiple locations… hard to identify the correct one"* — answered in the dropdown, before the search even runs.
- Locations and Food Type stay un-geocoded: those rows are labels, not places, and carry no `_geoloc`. **Possible follow-up:** give each location row a centroid from its restaurants, so "was" from New York offers Washington Heights before Washington DC.
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
