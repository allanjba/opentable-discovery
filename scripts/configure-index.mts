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
   * won and a 3.9-star restaurant led the list.
   *
   * A stopgap. `desc(stars_count)` cannot tell 5.0 from one review apart from
   * 5.0 from a thousand, which is visible immediately:
   *
   *   "italian"  Abruzzi Trattoria, 5.0 stars from 3 reviews, ranks #4,
   *              above Vittoria at 4.8 from 1,018
   *   "sushi"    Sekisui - Bartlett, 5.0 from 19 reviews, ranks #1,
   *              above Sushi Sasabune Hawaii at 4.8 from 329
   *
   * `desc(reviews_count)` alone has the mirror problem — volume beats quality.
   * The fix is a precomputed Bayesian average, which is the next step; Algolia
   * cannot compute it, because custom ranking sorts a stored attribute and
   * there is no query-time scoring function. That is the trade that keeps
   * responses in single-digit milliseconds.
   */
  customRanking: ["desc(stars_count)", "desc(reviews_count)"],

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
    "searchable(area)",
    "searchable(neighborhood)",
  ],

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
