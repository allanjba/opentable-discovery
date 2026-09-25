/**
 * Applies index settings to the "restaurants" index. This file is the source of
 * truth for settings — prefer changing it over clicking in the dashboard, so
 * the configuration is versioned alongside the code that depends on it.
 *
 * Keep this file in step with the index. Two of the settings below were applied
 * from Algolia's dashboard by its configuration assistant, and until they were
 * copied here the next run of this script would have silently reverted them —
 * which is the exact drift having one source of truth is meant to prevent.
 *
 * Still at Algolia's defaults, on purpose: ranking, typoTolerance, synonyms,
 * rules, removeWordsIfNoResults.
 *
 * Run with `npm run data:settings`.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { algoliasearch } from "algoliasearch";
import type { IndexSettings } from "algoliasearch";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(root, ".env"));

const INDEX_NAME = "restaurants";

const SETTINGS: IndexSettings = {
  /**
   * Ordered, and the order is the point: it drives the Attribute ranking
   * criterion. Comma-separated entries sit at equal weight.
   *
   * Left out deliberately: every URL, postal_code, phones, payment_options,
   * objectID, country. Unset, Algolia searches all of them — "restimages"
   * matched all 5,000 records because it appears in every image URL.
   *
   * address is also left out. Street names are a plausible query in principle,
   * but they add a lot of matchable text for a case OpenTable's own search does
   * not serve, and neighbourhood plus city already cover location intent.
   *
   * `name` is LAST, which is counter-intuitive and is a deliberate trade-off.
   * We had it first; Algolia's own configuration assistant moved it last, and
   * measuring both orders showed each one wins a different intent:
   *
   *   name first   "italian" -> Divino Italian Restaurant, Tony's Italian
   *                Ristorante, Cavatore Italian Restaurant — the word matched
   *                in the *name*, which is a naming convention, not a signal
   *   name last    "italian" -> Pazza Notte, Nicolosi's, Vittoria — restaurants
   *                that actually serve Italian, matched on cuisine
   *
   * The cost is single-word names that collide with a neighbourhood or cuisine.
   * `neighborhood` is now above `name`, so Attribute (6th) picks the
   * neighbourhood match, and Exact (7th) fires too late to rescue it:
   *
   *   "Lafayette"  the restaurant named Lafayette ranks #14 of 19
   *   "Rye"        #5 of 7        "Babylon"  #4 of 5        "Bistro"  #5 of 208
   *
   * 758 of 5,000 restaurants have a single-word name. Distinctive multi-word
   * names are unaffected — Sushi Yasaka, Wallsé, Quince Restaurant and Mama's
   * Fish House are all #1.
   *
   * Kept as-is for now because the category gain is the more common intent, but
   * this is genuinely a question about OpenTable's traffic mix rather than one
   * to settle by argument — their own placeholder reads "by Name, Cuisine,
   * Location". The candidate fix that would win both is moving `exact` ahead of
   * `attribute` in `ranking`, so an exact whole-name match outranks attribute
   * order. Untested, so not applied here.
   */
  searchableAttributes: [
    "cuisines,food_type",
    "neighborhood,city",
    "area",
    "dining_style",
    "name",
  ],

  /**
   * The 8th and last ranking criterion, and the only one that decides which
   * result comes *first* rather than which results come back. Unset, all 5,000
   * records tie on every textual criterion when browsing, so insertion order
   * won and a 3.9-star restaurant led a list of 5,000.
   *
   * Neither source field works alone, and both were tried on this index:
   *
   *   desc(stars_count)     "italian" put Abruzzi Trattoria, 5.0 stars from
   *                         3 reviews, at #4 — above Vittoria, 4.8 from 1,018
   *   desc(reviews_count)    the mirror flaw: volume beats quality
   *
   * So the ranking signal is `popularity_score`, a Bayesian average computed in
   * scripts/clean.mts. It has to be precomputed: customRanking sorts a stored
   * attribute and Algolia has no query-time scoring function, which is the
   * trade that keeps responses in single-digit milliseconds.
   *
   * Two entries because customRanking is a list of tie-breakers, like the main
   * formula. 2,280 records share a score at four decimals; when they do, prefer
   * the better-evidenced one.
   */
  customRanking: ["desc(popularity_score)", "desc(reviews_count)"],

  /**
   * Algolia's default order with `exact` moved one place ahead of `attribute`.
   * The default is typo, geo, words, filters, proximity, attribute, exact,
   * custom.
   *
   * Because `name` sits last in searchableAttributes, a restaurant whose name
   * is a single word that also names a place loses to the place. Promoting
   * `exact` lets a whole-word match outrank a prefix match before attribute
   * order is consulted:
   *
   *   "Union"   the restaurant named Union    #29 of 42  ->  #3
   *   "Rye"     the restaurant named Rye       #5 of 7   ->  #4
   *
   * A/B'd across 39 queries covering categories, known-item, location, typo and
   * prefix. Exactly those two changed; the other 37 were identical, so the
   * change is narrow and carries no measured regression.
   *
   * What it does NOT fix, and this is the part worth remembering: it cannot
   * break a tie *between* exact matches. `exact` counts exactly-matched words;
   * it does not know which attribute they matched in. Checked with
   * getRankingInfo — for "Lafayette", the restaurant named Lafayette and all 22
   * restaurants in the Lafayette neighbourhood or city report nbExactWords: 1.
   * They tie, the tie falls to `attribute`, and neighborhood outranks name
   * exactly as before. Lafayette is still #14 of 19.
   *
   * So this promotes exact over prefix, not name over neighbourhood. The real
   * answer to that one is a UI answer rather than a ranking answer — a
   * federated query presenting "restaurants named X" and "restaurants in X" as
   * separate groups instead of making them compete in one ordering.
   */
  ranking: [
    "typo",
    "geo",
    "words",
    "filters",
    "proximity",
    "exact",
    "attribute",
    "custom",
  ],

  /**
   * Only what the result card renders. objectID is always returned.
   *
   * Unset, every hit carries all 23 attributes — four URLs, the geo point, the
   * full address, payment options — about 1.4 KB per hit, most of it never
   * read. This is a display concern, not a search one: an attribute stays
   * searchable and facetable whether or not it is returned.
   *
   * reserve_url is deliberately absent. It is the obvious next UI addition,
   * and it should be added back deliberately when the booking link exists
   * rather than carried speculatively now.
   */
  attributesToRetrieve: [
    "name",
    "food_type",
    "neighborhood",
    "price",
    "stars_count",
    "reviews_count",
    "image_url",
  ],

  // Facet on `cuisines`, not `food_type`. The raw field packs several concepts
  // into one string on eight values, so faceting on it hides Southwestern,
  // Small Plates, Global and Latin entirely. searchable() also allows searching
  // within the facet values, which the sidebar will need at 116 of them.
  attributesForFaceting: [
    "searchable(cuisines)",
    "dining_style",
    // Facet on price, the integer tier, and render it as $$ / $$$ / $$$$ —
    // which is what OpenTable's own filter shows. Their picker has exactly
    // three options and this field has exactly three values (2, 3, 4, no 1),
    // which suggests price is the authoritative field and price_range is
    // derived from it.
    //
    // The card displays the same field, so the 220 records where price and
    // price_range disagree can never show a contradiction: filter and display
    // come from one source.
    "price",
    // The three location attributes are searchable() because the autocomplete
    // looks up matching values with searchForFacetValues, which only works on a
    // searchable() facet. area carries the metro hierarchy ("Portland /
    // Oregon"), so the three together read the way OpenTable's own dropdown
    // groups locations.
    "searchable(area)",
    "searchable(neighborhood)",
    "searchable(city)",
  ],

  /**
   * Unset, Algolia highlights every searchable attribute, and _highlightResult
   * was 49% of the payload while nothing rendered it. Now that InstantSearch's
   * <Highlight> is on the card, restrict it to the three attributes the card
   * actually shows.
   *
   * Configured here rather than in InstantSearch on purpose — Algolia's guide
   * is explicit that attributesToHighlight belongs to the index, not the UI.
   */
  attributesToHighlight: ["name", "food_type", "neighborhood"],

  // 116 distinct cuisine values against a default cap of 100, so 16 would be
  // silently missing from facet responses.
  maxValuesPerFacet: 200,
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env — check the file, values are not printed here.`);
  }
  return value;
}

/**
 * Settings are stored asynchronously, so poll until the values read back.
 *
 * Note that this only confirms the settings were *stored*. Search results
 * reflecting them is a separate, slower step — changing searchableAttributes
 * makes Algolia rebuild the index, which can take minutes on top of this. A
 * timeout here is therefore a warning, not a failure.
 */
async function waitForSettings(
  client: ReturnType<typeof algoliasearch>,
  timeoutMs = 90_000,
): Promise<IndexSettings | null> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const current = await client.getSettings({ indexName: INDEX_NAME });
    const applied = Object.entries(SETTINGS).every(
      ([key, value]) =>
        JSON.stringify(current[key as keyof IndexSettings]) === JSON.stringify(value),
    );

    if (applied) return current;

    if (Date.now() > deadline) return null;

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main() {
  const client = algoliasearch(
    requireEnv("APPLICATION_ID"),
    requireEnv("WRITE_API_KEY"),
  );

  await client.setSettings({ indexName: INDEX_NAME, indexSettings: SETTINGS });

  const confirmed = await waitForSettings(client);
  const settings = confirmed ?? (await client.getSettings({ indexName: INDEX_NAME }));

  console.log(`\n  configure-index → "${INDEX_NAME}"\n`);
  console.log(`    attributesForFaceting  ${JSON.stringify(settings.attributesForFaceting)}`);
  console.log(`    maxValuesPerFacet      ${JSON.stringify(settings.maxValuesPerFacet)}`);
  console.log(`    searchableAttributes   ${JSON.stringify(settings.searchableAttributes ?? "(default: every attribute)")}`);
  console.log(`    customRanking          ${JSON.stringify(settings.customRanking ?? "(default: none)")}`);
  console.log(`    ranking                ${JSON.stringify(settings.ranking)}`);

  if (!confirmed) {
    console.log(
      "\n    note: settings had not read back within 90s. They are almost certainly\n" +
        "    queued — re-run to confirm. Search results lag the stored settings\n" +
        "    regardless: a searchableAttributes change rebuilds the index.",
    );
  }
  console.log(
    "\n    Search behaviour propagates asynchronously — give it a few minutes\n" +
      "    before judging results or running search:compare.\n",
  );
}

main().catch((error) => {
  console.error(`\n  configure-index failed: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
