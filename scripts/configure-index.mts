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
  // Facet on `cuisines`, not `food_type`. The raw field packs several concepts
  // into one string on eight values, so faceting on it hides Southwestern,
  // Small Plates, Global and Latin entirely. searchable() also allows searching
  // within the facet values, which the sidebar will need at 116 of them.
  attributesForFaceting: ["searchable(cuisines)"],

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

/** Settings apply asynchronously, so poll until every key we set is visible. */
async function waitForSettings(
  client: ReturnType<typeof algoliasearch>,
  timeoutMs = 30_000,
): Promise<IndexSettings> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const current = await client.getSettings({ indexName: INDEX_NAME });
    const applied = Object.entries(SETTINGS).every(
      ([key, value]) =>
        JSON.stringify(current[key as keyof IndexSettings]) === JSON.stringify(value),
    );

    if (applied) return current;

    if (Date.now() > deadline) {
      throw new Error(
        "settings were accepted but never applied within 30s. If this persists, " +
          "check the index Configuration tab in the Algolia dashboard — a newly " +
          "created app can queue settings tasks without publishing them.",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main() {
  const client = algoliasearch(
    requireEnv("APPLICATION_ID"),
    requireEnv("WRITE_API_KEY"),
  );

  await client.setSettings({ indexName: INDEX_NAME, indexSettings: SETTINGS });
  const settings = await waitForSettings(client);

  console.log(`\n  configure-index → "${INDEX_NAME}"\n`);
  console.log(`    attributesForFaceting  ${JSON.stringify(settings.attributesForFaceting)}`);
  console.log(`    maxValuesPerFacet      ${JSON.stringify(settings.maxValuesPerFacet)}`);
  console.log(`    searchableAttributes   ${JSON.stringify(settings.searchableAttributes ?? "(default: every attribute)")}`);
  console.log(`    customRanking          ${JSON.stringify(settings.customRanking ?? "(default: none)")}`);
  console.log(`    ranking                ${JSON.stringify(settings.ranking)}\n`);
}

main().catch((error) => {
  console.error(`\n  configure-index failed: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
