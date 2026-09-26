/**
 * Derives the two indices the autocomplete queries, and pushes them.
 *
 *   public/data/restaurants.json  ──→  Algolia index "locations"
 *                                 ──→  Algolia index "cuisines"
 *
 * Why these exist at all: InstantSearch's <Autocomplete> renders *hits*, one
 * index per section. A facet-value lookup cannot be a section, and it could not
 * carry what these rows carry anyway — a display label, which field the label
 * came from, and a count used for ranking rather than just display.
 *
 * Nothing here is new information. It is the restaurant data aggregated, which
 * is also why it is worth looking at: aggregating a field shows you its dirt.
 *
 * Run with `npm run data:suggest`, after `npm run data:build`.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { algoliasearch } from "algoliasearch";
import type { IndexSettings } from "algoliasearch";
import { SYNONYMS } from "./synonyms.mts";
import type {
  CuisineSuggestion,
  LocationKind,
  LocationSuggestion,
  Restaurant,
} from "../src/lib/types.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = resolve(root, "public/data/restaurants.json");

process.loadEnvFile(resolve(root, ".env"));

const RESTAURANTS_INDEX = "restaurants";
const LOCATIONS_INDEX = "locations";
const CUISINES_INDEX = "cuisines";

/**
 * Broadest first. A label that appears as more than one kind is filed under the
 * broadest one — 759 of 2,029 location rows do, because "San Diego" is a city,
 * a neighbourhood and an area all at once. Emitting all three would put the
 * same place in the dropdown three times, which reads as broken.
 */
const KINDS: LocationKind[] = ["area", "city", "neighborhood"];

const FIELD_FOR_KIND: Record<LocationKind, keyof Restaurant> = {
  area: "area",
  city: "city",
  neighborhood: "neighborhood",
};

/**
 * Settings shared by both indices.
 *
 * One searchable attribute, and ranking by size. Without customRanking,
 * "portland" would put North Portland (5 restaurants) alongside Portland /
 * Oregon (197) with nothing to separate them — the same tie-break problem the
 * restaurants index had before popularity_score.
 */
function settingsFor(retrieve: string[]): IndexSettings {
  return {
    searchableAttributes: ["label"],
    attributesToRetrieve: retrieve,
    attributesToHighlight: ["label"],
    customRanking: ["desc(restaurant_count)"],
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in .env — check the file, values are not printed here.`);
  }
  return value;
}

/**
 * Counts how many restaurants each label actually returns.
 *
 * Not derived from the source fields, but measured by running the search the
 * user is about to run. Counting locally is wrong in a way that is easy to miss:
 * a text search for "Sushi" returns 106 restaurants while only 67 carry Sushi
 * in `cuisines`, because 39 more are NAMED "Sushi something" and filed under
 * Japanese. Any locally derived number promises something the search does not
 * deliver.
 *
 * Queried in batches with hitsPerPage 0, so no hits come back — only counts.
 * 1,385 labels in batches of 50 is 28 requests, a couple of seconds.
 * This makes the script depend on the restaurants index being indexed and
 * configured first, which is the natural order anyway:
 * data:build → data:index → data:settings → data:suggest.
 */
async function countByLabel(
  client: ReturnType<typeof algoliasearch>,
  labels: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const BATCH = 50;

  for (let i = 0; i < labels.length; i += BATCH) {
    const chunk = labels.slice(i, i + BATCH);
    const { results } = await client.search({
      requests: chunk.map((query) => ({
        indexName: RESTAURANTS_INDEX,
        query,
        hitsPerPage: 0,
        // Counted without typo tolerance, because choosing a suggestion is
        // choosing a literal string — the user is not mistyping it.
        //
        // It also keeps the number sane. Typo-tolerant counts are wild on short
        // labels: "Acme" measures 1,605 against a real 3, "Hilo" 252 against 1,
        // "Portlando" 296 against 1. Ranking on those would put Acme above New
        // York / Tri-State Area. Strict counting matches the source field
        // exactly for 1,012 of 1,275 labels, against 814 typo-tolerant.
        typoTolerance: false,
      })),
    });

    results.forEach((result, index) => {
      counts.set(chunk[index], "nbHits" in result ? (result.nbHits ?? 0) : 0);
    });
  }

  return counts;
}

/**
 * Builds the location rows.
 */
function buildLocations(restaurants: Restaurant[]): LocationSuggestion[] {
  const kindFor = new Map<string, LocationKind>();
  const labelFor = new Map<string, string>();

  for (const kind of KINDS) {
    for (const restaurant of restaurants) {
      const value = String(restaurant[FIELD_FOR_KIND[kind]] ?? "").trim();
      if (!value) continue;

      const key = value.toLowerCase();
      // KINDS is broadest-first, so the first kind to claim a label keeps it.
      if (!kindFor.has(key)) {
        kindFor.set(key, kind);
        labelFor.set(key, value);
      }
    }
  }

  // restaurant_count is filled in by countByLabel, which measures rather than
  // derives it.
  return [...kindFor].map(([key, kind]) => ({
    objectID: key,
    label: labelFor.get(key)!,
    kind,
    restaurant_count: 0,
  }));
}

function buildCuisines(restaurants: Restaurant[]): CuisineSuggestion[] {
  const counts = new Map<string, number>();
  const labelFor = new Map<string, string>();

  for (const restaurant of restaurants) {
    for (const cuisine of new Set(restaurant.cuisines)) {
      const key = cuisine.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!labelFor.has(key)) labelFor.set(key, cuisine);
    }
  }

  return [...counts].map(([key]) => ({
    objectID: key,
    label: labelFor.get(key)!,
    restaurant_count: 0,
  }));
}

async function push(
  client: ReturnType<typeof algoliasearch>,
  indexName: string,
  objects: object[],
  settings: IndexSettings,
) {
  await client.setSettings({ indexName, indexSettings: settings });

  // Synonyms are per-index, and the autocomplete queries three of them. Without
  // this, "nyc" returned 1,415 restaurants while the Locations section of the
  // dropdown stayed empty.
  await client.saveSynonyms({
    indexName,
    synonymHit: SYNONYMS,
    replaceExistingSynonyms: true,
  });

  // replaceAllObjects rather than saveObjects: these indices are fully derived,
  // so a label that disappears from the source has to disappear here too.
  // saveObjects would leave it behind forever.
  //
  // It copies to a temporary index and moves it into place, waiting internally
  // — no waitForTasks. Its default scopes keep settings, rules and synonyms,
  // so the setSettings above survives the swap.
  await client.replaceAllObjects({
    indexName,
    objects: objects as Record<string, unknown>[],
  });
}

async function main() {
  const appId = requireEnv("APPLICATION_ID");
  const client = algoliasearch(appId, requireEnv("WRITE_API_KEY"));

  const restaurants: Restaurant[] = JSON.parse(readFileSync(DATA_PATH, "utf8"));

  const locations = buildLocations(restaurants);
  const cuisines = buildCuisines(restaurants);

  console.log(`\n  build-suggest-indices → app ${appId}\n`);
  console.log(`    restaurants read   ${restaurants.length}`);

  // Measure what each label actually returns, rather than deriving it.
  const labels = [...locations.map((r) => r.label), ...cuisines.map((r) => r.label)];
  console.log(`    counting           ${labels.length} labels against "${RESTAURANTS_INDEX}"`);
  const counts = await countByLabel(client, labels);
  for (const row of [...locations, ...cuisines]) {
    row.restaurant_count = counts.get(row.label) ?? 0;
  }

  const empty = [...locations, ...cuisines].filter((r) => r.restaurant_count === 0);
  if (empty.length > 0) {
    console.log(`    ⚠ ${empty.length} labels return nothing — they would be dead suggestions`);
  }
  console.log(`    locations          ${locations.length}`);
  for (const kind of KINDS) {
    const n = locations.filter((row) => row.kind === kind).length;
    console.log(`      ${kind.padEnd(16)} ${String(n).padStart(5)}`);
  }
  console.log(`    cuisines           ${cuisines.length}`);

  await push(client, LOCATIONS_INDEX, locations, settingsFor(["label", "kind", "restaurant_count"]));
  await push(client, CUISINES_INDEX, cuisines, settingsFor(["label", "restaurant_count"]));

  console.log(`\n    pushed to "${LOCATIONS_INDEX}" and "${CUISINES_INDEX}"`);

  const biggest = [...locations].sort((a, b) => b.restaurant_count - a.restaurant_count)[0];
  console.log(`    largest location   ${biggest.label} (${biggest.restaurant_count})\n`);
}

main().catch((error) => {
  console.error("\n  build-suggest-indices failed:\n");
  console.error(`    ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
