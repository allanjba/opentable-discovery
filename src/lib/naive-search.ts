import type { Restaurant } from "./types";

// Test local search

const SEARCHED_FIELDS = [
  "name",
  "food_type",
  "neighborhood",
  "city",
] as const satisfies readonly (keyof Restaurant)[];

export type SearchResult = {
  hits: Restaurant[];
  total: number;
  elapsedMs: number;
};

function matches(restaurant: Restaurant, needle: string): boolean {
  if (needle.length === 0) return true;
  return SEARCHED_FIELDS.some((field) =>
    restaurant[field].toLowerCase().includes(needle),
  );
}

export function naiveSearch(
  restaurants: Restaurant[],
  query: string,
  cuisines: string[],
  limit = 20,
): SearchResult {
  const startedAt = performance.now();
  const needle = query.trim().toLowerCase();

  const matched = restaurants.filter(
    (restaurant) =>
      (cuisines.length === 0 || cuisines.includes(restaurant.food_type)) &&
      matches(restaurant, needle),
  );

  return {
    hits: matched.slice(0, limit),
    total: matched.length,
    elapsedMs: performance.now() - startedAt,
  };
}

/** Cuisine counts for the current query, computed by scanning every record. */
export function cuisineCounts(
  restaurants: Restaurant[],
  query: string,
): { value: string; count: number }[] {
  const needle = query.trim().toLowerCase();
  const counts = new Map<string, number>();

  for (const restaurant of restaurants) {
    if (!matches(restaurant, needle)) continue;
    counts.set(
      restaurant.food_type,
      (counts.get(restaurant.food_type) ?? 0) + 1,
    );
  }

  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}
