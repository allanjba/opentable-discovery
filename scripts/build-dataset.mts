/**
 * Builds the merged restaurant dataset
 *
 *   data/source/restaurants_list.json  ─┐
 *                                       ├─ join on objectID ─→ public/data/restaurants.json
 *   data/source/restaurants_info.csv   ─┘
 *
 * Stage 1: a straight join. No cleaning, no conflict resolution, no enrichment.
 * Run manually with `npm run data:build`.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Restaurant } from "../src/lib/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIST_PATH = resolve(root, "data/source/restaurants_list.json");
const INFO_PATH = resolve(root, "data/source/restaurants_info.csv");
const OUT_PATH = resolve(root, "public/data/restaurants.json");

// Simple parsing for the current data. Assume no quotes and same number of columns
function parseCsv(text: string, delimiter = ";"): Record<string, string>[] {
  const lines = text.split("\n");
  const header = lines[0].split(delimiter).map((column) => column);

  return lines.slice(1).map((line) => {
    const cells = line.split(delimiter);
    return Object.fromEntries(header.map((column, i) => [column, cells[i]]));
  });
}

function main() {
  const restaurantList = JSON.parse(readFileSync(LIST_PATH, "utf8"));
  const restaurantInfo = parseCsv(readFileSync(INFO_PATH, "utf8"));

  // create a lookup by key instead of each json item
  const restaurantInfoById = new Map(
    restaurantInfo.map((row) => [Number(row.objectID), row]),
  );
  const seenInRestaurantInfo = new Set<number>();

  const merged: Restaurant[] = [];
  const missingInfo: number[] = [];

  for (const item of restaurantList) {
    const infoRow = restaurantInfoById.get(item.objectID);

    if (!infoRow) {
      missingInfo.push(item.objectID);
      continue;
    }
    seenInRestaurantInfo.add(item.objectID);

    merged.push({
      ...item,
      // Parsin numeric field to match json
      food_type: infoRow.food_type,
      stars_count: Number(infoRow.stars_count),
      reviews_count: Number(infoRow.reviews_count),
      neighborhood: infoRow.neighborhood,
      phone_number: infoRow.phone_number,
      price_range: infoRow.price_range,
      dining_style: infoRow.dining_style,
    });
  }

  const orphanRestaurantInfo = [...restaurantInfoById.keys()].filter(
    (id) => !seenInRestaurantInfo.has(id),
  );

  const json = JSON.stringify(merged);

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, json, "utf8");

  // Output log

  const sizeMb = (Buffer.byteLength(json) / 1_048_576).toFixed(1);

  console.log("\n  build-dataset — stage 1, straight join on objectID\n");
  console.log(`    restaurants_list.json   ${restaurantList.length} records`);
  console.log(`    restaurants_info.csv    ${restaurantInfo.length} rows`);
  console.log(`    ${"-".repeat(44)}`);
  console.log(`    merged                  ${merged.length} records`);
  console.log(`    list without a csv row  ${missingInfo.length}`);
  console.log(`    csv row without a list  ${orphanRestaurantInfo.length}`);
  console.log(`\n    → ${relative(root, OUT_PATH)}  (${sizeMb} MB)\n`);

  if (missingInfo.length > 0 || orphanRestaurantInfo.length > 0) {
    console.warn("    ⚠ join is not 1:1 — inspect before indexing\n"); // Csv has an empty line at the end
  }
}

main();
