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

1. ~~`removeWordsIfNoResults`~~ — **done**, as `firstWords`. See below; the premise that it was unset turned out to be wrong.
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

Pure UI, no setting: active filter chips + clear-all · ~~empty-state discovery surface~~ (done) · replace "in 0.002 seconds" with something a diner cares about · responsive/mobile.

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
- **The origin is resolved server-side**, from Vercel's `x-vercel-ip-latitude` / `-longitude` / `-city` / `-country-region` headers, and passed into the client as `initialOrigin`. Verified: with those headers the *server-rendered HTML* already contains the NYC restaurants and "sorted by distance from New York, NY".
- That killed a visible flicker. Asking the browser happened after hydration, so first paint was unsorted and results swapped a few hundred ms later. It also removed a permission prompt on page load, which was an interruption for something nobody asked for. Precise location is still offered in the demo panel — an upgrade, not a toll gate.
- Not Algolia's `aroundLatLngViaIP`: their docs are explicit that a server-side request geolocates to the *server* unless you forward `X-Forwarded-For`, and `/` is server-rendered. Reading Vercel's headers ourselves gets the same answer without that trap — and gives us the value to keep.
- IP accuracy is city-level, which is all that's needed: `aroundPrecision` buckets at 2 km, so a few hundred metres of error changes no ordering.
- An **explicit** choice (preset or granted browser location) persists in a **cookie**, not localStorage — and that's the point. localStorage is invisible to the server, so a remembered location could only be applied after hydration: every visit rendered once without it and then swapped. A cookie travels with the request. The IP guess is deliberately not stored (recomputed anyway, and a stale copy would fight the fresh one).
- Resolution order, all server-side: **cookie → IP headers → nothing**. Verified by curl on each path, and by sampling the first result across a real navigation — one distinct value, no swap.
- Two bugs found doing this, both worth remembering. **`Number(null)` is `0`, not `NaN`** — with no Vercel headers locally, the finite-check passed with lat/lng `0,0` (Gulf of Guinea), so every result read "8,507 km away" and the nearest restaurants were the easternmost in the dataset. Looked like a geo bug; was a coercion bug.
- And **a constant exported from a `"use client"` module read as `undefined` on the server**, so the cookie was never found. The shared `Origin` type and cookie name now live in `lib/origin.ts`, which has neither `"use client"` nor a `next/headers` import — server and browser each take what they need without pulling in the other's dependencies.
- `aroundRadius: "all"` sorts by distance without filtering. A fixed radius would return **zero** results from anywhere uncovered.
- `aroundPrecision: 2000` — 2 km buckets, so restaurants in the same neighbourhood tie on Geo and fall through to relevance and `popularity_score`. Visible in the demo: from New York the top three are 1.5 / 0.5 / 1.9 km, ordered by reviews (4,777 → 1,762 → 1,105), not by distance. At the 10 m default, distance alone would order everything and popularity would never get a say.
- Distance comes from `_rankingInfo.matchedGeoLocation.distance` (`getRankingInfo`, only while geo is on) — no client-side haversine, and no need to retrieve `_geoloc` on every hit.
- **Coverage is patchy and the UI says so.** Within 10 km: New York 770, Denver 137, San Francisco 127, Miami 32, LA 9. **Zero** for Atlanta (nearest 167 km), Chicago (116), Boston (123), Seattle (220), Salt Lake City (207), Paris (5,608), London (5,328). Of Algolia's five offices only NYC and SF have data.
- A banner used to announce the coverage gap when the nearest hit was >50 km away. **Removed** — every card already carries its own distance, so it restated the results and took the top of the page to do it. The gap is still worth raising with the customer; it doesn't need a permanent fixture to make the point.
- Worth keeping from that episode: the banner's first version conflated two facts. Browsing from SLC, "no inventory near you" is true. But searching `New York` from Miami also puts the first hit 1,676 km away, and concluding "no inventory near Miami" from that is false — Miami has 32 restaurants within 10 km. A far first result can mean *you have no inventory here* or *nothing matching this is here*, and only the first is about coverage.
- Watchdog on the location request: `getCurrentPosition`'s own `timeout` does **not** cover the permission prompt — Chrome doesn't start counting until you answer. An ignored prompt pinned the UI in "requesting" forever. 12s fallback, and a late fix still wins.
- All 5,000 records have valid `_geoloc` already in Algolia's expected shape.
- **Infinite scroll** via `useInfiniteHits` + an IntersectionObserver sentinel. InstantSearch has no auto-loading widget — `<InfiniteHits>` gives you a button and stops — and the hook-plus-sentinel is Algolia's own documented pattern.
- Non-obvious bit: an IntersectionObserver only fires when an element **crosses** the threshold. If a page is short enough that the sentinel is still on screen afterwards, no second event arrives and the list stalls. The observer is rebuilt after each page so it re-fires while the sentinel stays visible — fills the viewport, then stops.
- `rootMargin: 400px` starts the next page before the sentinel is actually visible.
- Ceiling: `paginationLimitedTo` defaults to **1,000** hits and Algolia warns that raising it slows search. It degrades gracefully — `isLastPage` just goes true there.
- **One page size (10) everywhere.** The 3-result browse teaser could not survive infinite scroll: the sentinel is on screen at first paint, so a second page loads before anyone sees three. Keeping it only meant 5 round trips for 15 results.
- Search bar and sidebar are `sticky`, rather than an inner scroll container. One scrollbar, the observer keeps its default viewport root, and no nested-scroll behaviour to go wrong on touch. Sticky is `sm:`-only, so mobile keeps normal flow.
- The sidebar is **two** elements, because the divider and the sticking want opposite things from one box. A flex child stretches to the row height, which is what draws `border-r` all the way down — but a full-height element has nothing to stick to. `self-start` fixed the sticking and collapsed the box, so the border stopped partway down the page. Now a stretched wrapper owns the border and the sticky aside sits inside it. Verified on a long results page: wrapper and results column both 2,286px, aside still pinned at 104px while scrolled to 598.
- Also fixed in passing: a real no-results state (the InstantSearch migration had dropped it) and "1 **results** found".
- **The autocomplete's Restaurants section is distance-aware too.** Each index in `<Autocomplete>` has its own `searchParameters` and does **not** inherit the page's `<Configure>`, so the geo params are passed explicitly — better anyway, since the dropdown can be tuned separately.
- Same query, different origin: `steak` from Denver offers Prime Steakhouse, **Ruth's Chris - Denver**, Morton's - Denver, LoHi Steakbar. From New York: Bobby Van's, Liberty Prime, Staghorn, Frankie & Johnnie's. That Ruth's Chris line is the brief's third pain point — *"chains have multiple locations… hard to identify the correct one"* — answered in the dropdown, before the search even runs.
- Locations and Food Type stay un-geocoded: those rows are labels, not places, and carry no `_geoloc`. **Possible follow-up:** give each location row a centroid from its restaurants, so "was" from New York offers Washington Heights before Washington DC.
- **Autocomplete empty state**: before anything is typed the panel shows **Trending near you** (the 5 nearest good restaurants — an empty query against a geo-sorted index already *is* "nearest and best") and **Recent searches** under it. Locations and Food Type stay hidden until there's a query, because "the five biggest cities" isn't a suggestion.
- Recent searches use the widget's built-in `showRecent` (localStorage, dedupe, per-row remove) rather than a hand-rolled list. Its stock row draws an unsized SVG clock that fills the panel without `instantsearch.css`, so the row is ours.
- **`<Autocomplete>` resets its own input whenever its parent re-renders.** Holding the typed value in `useState` destroyed it on the first keystroke — headers switched correctly while the box went blank. The value lives in a small external store instead; only the header and panel layout subscribe, and the component holding the widget never re-renders. Every prop it receives is referentially stable for the same reason.
- Client uses `algoliasearch/lite` (search-only, smaller bundle); its method is `searchForHits`, not `searchSingleIndex`.
- **Recent searches did nothing when clicked, and the bug bred more of itself.** A recent item is `{ query }` — no `name`, no `label` — so `queryFor` fell through to `return ""`. Clicking your own last search *cleared* the box instead of re-running it.
- The widget records whatever is submitted, so that empty string was then saved as a recent search: every click added another blank row. Found `["sushi","","zzzzzz",...]` in localStorage.
- Fixed by teaching `queryFor` the recent shape, plus a guard — `onSelect` never sets an empty query, so no future unrecognised row shape can wipe the box or poison the history. `RecentRow` also hides blank entries, for history poisoned before the fix.
- Worth noting how it hid: nothing threw. The reported "console errors" could not be reproduced — the Next dev overlay showed no issue and the extension's console buffer was replaying pre-fix hydration errors. The real symptom was silent.
- **Settings drift, second occurrence — and this one shipped a broken feature.** Allan spotted the Food Type section looking wrong. All three indices had picked up one identical restaurant-shaped `attributesToRetrieve` (`city, food_type, image_url, mobile_reserve_url, name, neighborhood, price, reserve_url, reviews_count, stars_count`). None of those fields exist on a `locations` or `cuisines` record, so both indices returned `{objectID}` and nothing else.
- It failed **silently**: `LocationRow` and `CuisineRow` guard on the shape and return an empty fragment, so the headers rendered with no rows instead of throwing. Worth knowing that a defensive guard turned a crash into an invisible bug — the section looked empty, which reads as "no matches".
- The build script was never wrong. `settingsFor(["label","kind","restaurant_count"])` is right there at the bottom of `build-suggest-indices.mts`; the live index had simply been overwritten since the last run. `npm run data:suggest` restored it.
- The signature to recognise: **all three indices carrying the same list** is a dashboard action applied across indices, not a script. A script writes one index at a time with its own list.
- Re-running also re-measured the counts against current settings — they had been built before `minWordSizefor1Typo: 5` and the synonyms, so they were stale. `Sushi` 106 → 104, `Barbecue` 26 → 27.
- **Resolved:** `city` and `reserve_url` are now in `configure-index.mts` deliberately, `mobile_reserve_url` is not. Script and index agree again.
- `city` was never decoration — the autocomplete renders `{neighborhood}, {city}`, so while it was missing from the list every dropdown row ended in a dangling comma. The dashboard edit fixed a bug that was already there.

## Query behaviour — and the drift lesson that actually matters

- **`setSettings` is a partial update.** Any key `configure-index.mts` does not name keeps whatever was last written to it, indefinitely and invisibly. "The script is the source of truth" was only ever true for the keys it mentions — which is why the audit missed these: it diffed the keys the script declares.
- Found live and in neither the script nor these notes: **`removeWordsIfNoResults: "firstWords"`** and **`advancedSyntax: true`**. Both are now written down and owned.
- Correction to an earlier note here: `pizza under 50` does **not** return 0. It returns 3, and 20 with words relaxed. `firstWords` was already doing the work this file claimed was missing.
- **`firstWords`, not `lastWords`, and the direction matters.** English puts the modifier first and the head noun last, so dropping from the front keeps the thing being asked for: `romantic italian` → drops "romantic" → **874**. `lastWords` would drop "italian" and leave "romantic" → **0**.
- Not a cure-all: `outdoor seating` is still 0, because neither word exists anywhere in the catalogue. That is a data gap, not something a query setting should paper over — it is now the no-results surface's job.
- **`advancedSyntax` turned off**, deliberately, having been found on. It works — `steak -house` was **152** on and **77** off — and that difference is the reason. Off it means "steak AND house"; on it means "steak AND NOT house", the opposite set, from a string somebody typed meaning "steakhouse".
- Checked the other way before deciding: unbalanced quotes, spaced hyphens and apostrophes (`"fish house`, `bar - b - q`, `mama's fish house`) are **identical** on and off, so the operators are the only behaviour given up. Nothing in the UI teaches the syntax, so no diner could discover it anyway.

## Discovery surface

- **Four rows, on different axes**: Trending · two cuisines · one neighbourhood. A fourth *cuisine* row would be more of the same axis; the point is more ways in, not more volume.
- Neighbourhood density is there for it — within 50 km: NY Midtown West 80 / UES 67 · Denver Downtown-LoDo 70 / Boulder 27 · Miami South Beach 11.
- The neighbourhood row **only renders when there is inventory nearby**. Unlike cuisine it has no sensible global fallback — "Midtown West" means nothing to someone browsing from a city we do not cover.
- Its "See all" **sets the query** rather than a facet, matching the autocomplete's existing rule: `neighborhood` has no sidebar widget, so a facet refinement would be an invisible filter nobody could see or clear.
- **Same rows appear below results** when a search returns nothing, or when the list reaches its end.
- The end-of-list case has **no heading and no rule above it**. The list visibly stopping is its own announcement, and "That's everything" followed immediately by more suggestions read as a contradiction. Only the no-results case keeps a title ("Nothing matched — but these are worth a look"), because there the rows need explaining.
- Non-obvious: **you cannot put anything below an infinite list** — the sentinel keeps loading until `isLastPage`. So this surface is reachable exactly when the user has run out, and not a moment earlier. That is the design, not a limitation.
- Two details that make the reuse work: each row's `<Configure>` sets **`query=""`**, because a child `<Index>` inherits the parent's query — without it "Popular Italian" below a failed search would search for the failed term too. And "See all" **clears** the query and replaces refinements rather than merging, since layering a cuisine onto the search you are escaping just fails again.
- **Reversal:** trending used to read the root index's hits to save a query. That only works while the root query is empty, which stops being true the moment the rows appear below a search. It is now its own `<Index>` like the others — one extra query, batched into the same request, and one code path instead of two.

## Booking

- **The whole card is the link**, both the wide result card and the compact landing card. No "Reserve" button: a result card has one obvious action, and a button beside it means two tap targets competing for the same intent — on a phone the card is what a thumb lands on anyway.
- `target="_blank"` + `rel="noopener noreferrer"`. This leaves the demo, and losing a search you have just set up to an outbound click mid-walkthrough is not recoverable.
- Hover: title to `text-brand`, image gains a shadow, both transitioned. Focus-visible ring for keyboard, matching the search input's idiom.
- All 5,000 records have a unique `reserve_url`, so there is no missing-link state to design around. Verified 9/9 landing cards and 10/10 result cards carry a real `rid`.
- Small trade: the title's search highlight and the hover colour are the same brand blue, so while hovering you lose the highlighted-substring distinction. Acceptable — hover is signalling "this is clickable", which is the more useful message at that moment.
- Minor, not fixed: the source URLs are `http://`, so each click takes a redirect to https. It is in the source data; upgrading belongs in `clean.mts` if it is worth doing.

- **Discovery landing** before any search: three rows of three — Trending near you, plus two cuisines — instead of a flat list of 5,000. Compact card for the rows, the wide card stays for results.
- Shows when there is no query **and** no active facet. Query alone was wrong: picking a cuisine with an empty box left the landing up, ignoring the filter just set.
- Each cuisine row is its own `<Index>` scope on the same index. InstantSearch batches them — switching city is **1 HTTP call** for all three rows.
- A fresh landing load makes **zero** browser requests to Algolia; `InstantSearchNext` renders the rows server-side. (First measurement said 1 — the regex matched a Next chunk named `algoliasearch-helper.js`. A filename with the vendor's name is not a request to the vendor.)
- **Cuisine rows come from local facet counts, not a hardcoded pair.** The tempting shortcut — read them off the page's own facets — is a trap: `aroundRadius: "all"` sorts without filtering, so those counts are the global ones. Localising needs a bounded radius and a second query.
- Worth it, because the order inverts. Within 50 km — **NY** Italian 260 / American 194 · **Denver** American 43 / Contemporary American 30 · **SF** Italian 38 / American 25 · **Miami** Italian 12 / Seafood 6 · **SLC** zero. Nationally American leads; locally Italian usually does.
- 50 km not 25: NY 895→1,114, Miami 37→50, and neither stops being "near you".
- Labels are tiered so nothing claims to be local that isn't — "Popular Italian near you" only with inventory nearby, else "Popular Italian" / "Popular right now". Same mistake the coverage banner made, caught before repeating it.
- `router.refresh()` on every origin change. The chosen cuisines are **server** state and the panel's origin is **client** state, so switching to Denver updated every restaurant while the headings still read New York's order. One line, in the one function all three origin paths funnel through.
- "See all Italian →" applies a real refinement, not a text search. `useInstantSearch` must be called **above** the row's `<Index>` or it refines the row's private scope and nothing happens.
- Known: a restaurant can appear in two rows where local inventory is thin (Miami, 50 within 50 km). Dedupe would mean serialising the three queries — not worth trading the single batched request.
- Rows are **2-up on a phone, 3-up from `sm`**, with the third card hidden below `sm` rather than wrapping. One-up made each card a full-width 3:2 image — three filled 2.5 screens and the second row was unreachable. A lone card under a pair reads as a layout bug; "See all" covers the rest.

## Mobile

- **Detached autocomplete mode is off** (`detachedMediaQuery="none"`). Below 680px the widget swaps its inline form for a full-screen button + overlay, and that broke twice over.
- The detached DOM is ten separate class names that `instantsearch.css` would size and we style with Tailwind, so the search icon rendered at **295×295**. Same root cause as the recent-searches clock.
- Worse, it **failed hydration on every mobile load**: the server can't evaluate a media query so it renders the form, the client renders the button, React finds `<form>` where it expected `<div role="button">` and rebuilds the whole search tree. On a page whose point is SSR, mobile was throwing the HTML away.
- Styling the ten class names would have fixed the icon and left the hydration failure. One prop fixes both. What it costs is the full-screen overlay — worth saying why: **detached mode is structurally incompatible with SSR**, since the decision depends on a viewport the server cannot see.
- Verified server-vs-client, not by console: server HTML has `ais-AutocompleteForm` ×1 and the detached button ×0, client DOM at 375px matches, no oversized SVG anywhere, panel still opens and highlights.
- Lesson: **a console buffer is not an observation.** It kept replaying the pre-fix error after the fix. "Is this still happening" is answered by comparing what the server sent with what the client built.

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
