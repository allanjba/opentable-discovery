# OpenTable — restaurant search & discovery prototype

A working prototype of a modern restaurant discovery experience for OpenTable,
built on Algolia from the 5,000-record dataset provided.

**Live demo:** https://opentable-discovery.vercel.app
**Comparison:** [`/old`](https://opentable-discovery.vercel.app/old) — the same data behind a
naive substring search, for a side-by-side.

---

## The approach

The discovery notes describe two users with opposite needs: one who knows the
restaurant and wants it fast and forgiving, and one who wants to be shown
something. Most of the work below is an attempt to serve both without
compromising either.

Three things drove the build:

**1. Relevance is a data problem before it is a settings problem.** Algolia
ranks on _stored_ attributes — there is no query-time scoring function, which is
the trade that buys single-digit-millisecond responses. So any ranking signal
the data doesn't already carry has to be computed in the pipeline. Three
features here needed data work first: cuisine faceting needed `food_type` split
into an array, popularity ranking needed a score that doesn't exist in the
source, and the autocomplete needed two derived indices.

**2. Every setting change was measured before and after.** The numbers below are
from this dataset, not from documentation. Several candidate changes were
measured and then _rejected_

**3. A prototype is read as a proposal.** Anything on the page is a claim about
what the product should do, so everything that exists only for demonstration lives
behind a demo panel (`Ctrl+Shift+D`) rather than on the page.

---

## Data preparation

`npm run data:build` — joins, cleans and enriches; output is committed.

- **Join** on `objectID` across `restaurants_list.json` (5,000) and
  `restaurants_info.csv`. Failures are reported in _both_ directions; the
  orphaned CSV row is the one that fails silently otherwise.
- **The join stays faithful.** It produces a strict superset of the source, and
  every transformation lives in one file (`scripts/clean.mts`) so the data's
  history is readable.
- **`food_type` → `cuisines[]`**, split on `/` and `,`, raw field kept for
  display. This alone made Southwestern (36), Small Plates (42), Global (43),
  Latin (13) and Eclectic (30) facetable — they had no facet presence at all
  before.
- **`phone` + `phone_number` → `phones[]`.** They disagree on 95 of 5,000
  records; both are kept rather than a winner picked silently.
- **`popularity_score`** — a Bayesian average.

---

## Relevance configuration

`scripts/configure-index.mts` is the **source of truth** for index settings.
Dashboard edits have caused some problems when playing around so having a
source of truth helped during the process.
Apply them by running `npm run data:settings`

| Setting                 | Change                                          | Measured effect                                                                                               |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `customRanking`         | `desc(popularity_score)`, `desc(reviews_count)` | Ellen's Cafe (5.0★, **1 review**) went from #1 to #2,391                                                      |
| `searchableAttributes`  | ordered, `name` **last**                        | `italian` returns restaurants that _serve_ Italian, not ones named "Italian"                                  |
| `ranking`               | `exact` moved ahead of `attribute`              | `Union` #29 → #3; 37 of 39 test queries unchanged                                                             |
| `minWordSizefor1Typo`   | 4 → 5                                           | `Acme` 1,605 → 3 · `Hilo` 252 → 1 · `Napa` 239 → 8, while `stakehouse` (423) and `restaurnt` (564) still work |
| synonyms                | 5 entries                                       | `bbq` 4 → 26 · `nyc` 15 → 1,415 · `sf` 5 → 264 · `nola` 4 → 94                                                |
| `attributesToRetrieve`  | 23 → 9 attributes                               | ~34% smaller payload                                                                                          |
| `attributesToHighlight` | 3 attributes                                    | `_highlightResult` had been 49% of the payload with nothing rendering it                                      |

`npm run search:compare` runs the same queries against both implementations —
that is the tuning evidence, re-run after every change.

---

## Running it

```bash
npm install
cp .env.example .env     # fill in Algolia credentials
npm run dev
```

| Command                  |                                                        |
| ------------------------ | ------------------------------------------------------ |
| `npm run data:build`     | join + clean + enrich → `public/data/restaurants.json` |
| `npm run data:index`     | push 5,000 records to the `restaurants` index          |
| `npm run data:settings`  | apply index settings and synonyms                      |
| `npm run data:suggest`   | build the `locations` and `cuisines` indices           |
| `npm run search:compare` | naive vs Algolia, side by side                         |

Next.js 16 · React 19 · TypeScript · Tailwind 4 · React InstantSearch 7.
Scripts are `.mts`, run natively by Node 24.

---

`NOTES.md` holds the full working log, including what was measured and
deliberately _not_ changed.
