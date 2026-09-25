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
import type {
  CuisineSuggestion,
  LocationKind,
  LocationSuggestion,
  Restaurant,
} from "../src/lib/types.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = resolve(root, "public/data/restaurants.json");

process.loadEnvFile(resolve(root, ".env"));

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
 * Builds the location rows.
 *
 * The count is the number of restaurants matching the label in ANY of the three
 * fields, not the count for the one field it was filed under. That matters
 * because selecting a suggestion runs a plain text search, and Algolia searches
 * all three — so a per-field count would under-report what the user is about to
 * get. "San Diego" is 285 as an area and 162 as a city; the union is what they
 * will actually see.
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

  const counts = new Map<string, number>();
  for (const restaurant of restaurants) {
    // A restaurant counts once per distinct label, even when two of its fields
    // carry the same one.
    const seen = new Set(
      KINDS.map((kind) => String(restaurant[FIELD_FOR_KIND[kind]] ?? "").trim().toLowerCase()),
    );
    for (const key of seen) {
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...kindFor].map(([key, kind]) => ({
    objectID: key,
    label: labelFor.get(key)!,
    kind,
    restaurant_count: counts.get(key) ?? 0,
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

  return [...counts].map(([key, restaurant_count]) => ({
    objectID: key,
    label: labelFor.get(key)!,
    restaurant_count,
  }));
}

async function push(
  client: ReturnType<typeof algoliasearch>,
  indexName: string,
  objects: object[],
  settings: IndexSettings,
) {
  await client.setSettings({ indexName, indexSettings: settings });

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
