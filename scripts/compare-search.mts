import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { algoliasearch } from "algoliasearch";
import type { Restaurant } from "../src/lib/types.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile(resolve(root, ".env"));

const INDEX_NAME = "restaurants";

/** Each query probes a specific behaviour named in the AE's discovery notes. */
const QUERIES: { query: string; probes: string }[] = [
  { query: "Wallsé", probes: "exact name, with accent" },
  { query: "Wallse", probes: "accent dropped" },
  { query: "Tia Pol", probes: "accent dropped" },
  { query: "cafe des beaux", probes: "accent + partial name" },
  { query: "stakehouse", probes: "typo" },
  { query: "steakhouse", probes: "correct spelling" },
  { query: "steak house", probes: "same intent, split into two words" },
  { query: "pappas", probes: "chain with two locations" },
  { query: "italian", probes: "broad category" },
  { query: "town", probes: "a name that is also a common word" },
];

const SEARCHED_FIELDS = [
  "name",
  "food_type",
  "neighborhood",
  "city",
] as const satisfies readonly (keyof Restaurant)[];

function naiveCount(restaurants: Restaurant[], query: string): number {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return restaurants.length;
  return restaurants.filter((restaurant) =>
    SEARCHED_FIELDS.some((field) =>
      restaurant[field].toLowerCase().includes(needle),
    ),
  ).length;
}

async function main() {
  const restaurants: Restaurant[] = JSON.parse(
    readFileSync(resolve(root, "public/data/restaurants.json"), "utf8"),
  );

  const client = algoliasearch(
    process.env.APPLICATION_ID!,
    process.env.SEARCH_API_KEY!,
  );

  console.log(
    "\n  query              probes                          naive   algolia   algolia top hit",
  );
  console.log("  " + "-".repeat(104));

  let fixed = 0;

  for (const { query, probes } of QUERIES) {
    const naive = naiveCount(restaurants, query);
    const response = await client.searchSingleIndex({
      indexName: INDEX_NAME,
      searchParams: { query, hitsPerPage: 1 },
    });

    const top =
      (response.hits[0] as { name?: string } | undefined)?.name ?? "—";
    // nbHits is optional in the response type — absent when the index is empty.
    const hits = response.nbHits ?? 0;
    const wasBroken = naive === 0 && hits > 0;
    if (wasBroken) fixed++;

    console.log(
      "  " +
        query.padEnd(19) +
        probes.padEnd(32) +
        String(naive).padStart(5) +
        String(hits).padStart(10) +
        "   " +
        top +
        (wasBroken ? "   ← was 0" : ""),
    );
  }

  console.log(
    `\n  ${fixed} queries that returned nothing now return results.\n`,
  );
}

main().catch((error) => {
  console.error(
    `\n  compare-search failed: ${error instanceof Error ? error.message : error}\n`,
  );
  process.exitCode = 1;
});
