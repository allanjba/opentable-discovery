/**
 * Pushes the merged dataset into Algolia.
 *
 *   public/data/restaurants.json  ──→  Algolia index "restaurants"
 *
 * Run manually with `npm run data:index`, and re-run after any `npm run
 * data:build` to pick up data changes. Re-running is safe: records are matched
 * on objectID, so an existing record is replaced rather than duplicated.
 *
 * No index settings are configured here on purpose. The first Algolia search
 * should show the untuned default so that every searchable attribute, ranking
 * rule and facet we add later is a visible, separately committed improvement.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { algoliasearch } from "algoliasearch";
import type { Restaurant } from "../src/lib/types.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = resolve(root, "public/data/restaurants.json");

export const INDEX_NAME = "restaurants";

/** Node 24 reads .env natively — no dotenv dependency. */
process.loadEnvFile(resolve(root, ".env"));

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env — check the file, values are not printed here.`);
  }
  return value;
}

async function main() {
  const appId = requireEnv("APPLICATION_ID");
  const writeKey = requireEnv("WRITE_API_KEY");

  const restaurants: Restaurant[] = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  const client = algoliasearch(appId, writeKey);

  console.log(`\n  index-algolia → "${INDEX_NAME}" on app ${appId}\n`);
  console.log(`    records to send   ${restaurants.length}`);

  const startedAt = Date.now();

  // waitForTasks makes this synchronous from our point of view: the call does
  // not resolve until Algolia has finished processing every batch, so a
  // successful return means the records really are searchable.
  const responses = await client.saveObjects({
    indexName: INDEX_NAME,
    objects: restaurants as unknown as Record<string, unknown>[],
    waitForTasks: true,
  });

  const sent = responses.reduce((total, batch) => total + batch.objectIDs.length, 0);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`    batches           ${responses.length}`);
  console.log(`    acknowledged      ${sent}`);
  console.log(`    elapsed           ${elapsed}s`);

  if (sent !== restaurants.length) {
    console.warn(
      `\n    ⚠ Algolia acknowledged ${sent} of ${restaurants.length} — investigate before searching\n`,
    );
  }

  // Read one record back to confirm it is really there, and to see what Algolia
  // did with our integer objectID.
  const check = await client.searchSingleIndex({
    indexName: INDEX_NAME,
    searchParams: { query: "Wallsé", hitsPerPage: 1 },
  });

  const hit = check.hits[0] as Record<string, unknown> | undefined;

  console.log(`\n    round-trip check  query "Wallsé" → ${check.nbHits ?? 0} hits`);
  if (hit) {
    console.log(`    objectID          ${JSON.stringify(hit.objectID)}  (typeof ${typeof hit.objectID})`);
    console.log(`    name              ${JSON.stringify(hit.name)}`);
  }
  console.log();
}

main().catch((error) => {
  console.error("\n  index-algolia failed:\n");
  console.error(`    ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
