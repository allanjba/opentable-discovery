/**
 * Applies index settings to the "restaurants" index. This file is the source of
 * truth for settings — prefer changing it over clicking in the dashboard, so
 * the configuration is versioned alongside the code that depends on it.
 *
 * Deliberately minimal for now. searchableAttributes, customRanking, synonyms
 * and rules are all left at Algolia's defaults so the relevance tuning step
 * later produces a real before and after rather than starting from an index
 * that is already tuned.
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
   * criterion, so a match on the restaurant name outranks a match on the city.
   * Comma-separated entries sit at equal weight.
   *
   * Left out deliberately: every URL, postal_code, phones, payment_options,
   * objectID, country. Unset, Algolia searches all of them — "restimages"
   * matched all 5,000 records because it appears in every image URL.
   *
   * address is also left out. Street names are a plausible query in principle,
   * but they add a lot of matchable text for a case OpenTable's own search does
   * not serve, and neighbourhood plus city already cover location intent.
   */
  searchableAttributes: [
    "name",
    "cuisines,food_type",
    "neighborhood,city",
    "area",
    "dining_style",
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
