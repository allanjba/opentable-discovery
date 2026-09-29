import { INDEX_NAME, searchClient } from "@/lib/algolia";
import type { Origin } from "@/lib/origin";

/**
 * Which cuisines get their own row on the landing page, resolved on the server.
 *
 * The rows are meant to answer "what is worth eating around here", and the only
 * signal this dataset carries for that is how much local inventory each cuisine
 * has. On a real engagement this row is analytics-driven — Insights events
 * feeding Dynamic Re-ranking, or a Query Suggestions index built from actual
 * searches. Neither exists on a catalogue with no behavioural data, so facet
 * counts stand in, and the substitution is the interesting part to talk about.
 *
 * Resolved server-side, alongside the origin, so the first paint already knows
 * which rows to draw. Doing it in the browser would cost a second round trip
 * before the sections could even be requested.
 */

/** Two rows. Enough to show the idea; more would push the results below the fold. */
const SECTION_COUNT = 2;

/**
 * The radius that counts as "around here".
 *
 * Measured at both 25 and 50 km: New York goes 895 -> 1,114 restaurants and
 * Miami 37 -> 50, while neither stops being a fair description of "near you".
 * The wider one is chosen because thin local inventory makes for a thin row.
 */
const NEARBY_RADIUS_M = 50_000;

export type TopCuisines = {
  values: string[];
  /**
   * Whether `values` came from local inventory.
   *
   * The labels depend on it. A false "near you" is the specific mistake this
   * project already made once with the coverage banner: from Salt Lake City the
   * nearest restaurant is 207 km away, so the rows are still worth showing but
   * calling them local would be a lie.
   */
  nearby: boolean;
};

export async function topCuisines(origin: Origin | null): Promise<TopCuisines> {
  // aroundRadius "all" — what the page itself uses — sorts by distance without
  // filtering, so facet counts under it are identical to the global ones.
  // Verified: New York returns American 882 / Italian 850, exactly the whole
  // catalogue. Localising the counts needs a bounded radius, which is why this
  // is a separate query rather than something read off the page's own results.
  if (origin) {
    const local = await cuisinesByCount({
      aroundLatLng: `${origin.lat},${origin.lng}`,
      aroundRadius: NEARBY_RADIUS_M,
    });

    // Worth seeing in a demo: the local order is not the national one. Within
    // 50 km of New York, Italian (199) beats American (153); Miami leads with
    // Italian, Steakhouse and Seafood. Nationally American is first.
    if (local.length) return { values: local.slice(0, SECTION_COUNT), nearby: true };
  }

  return { values: (await cuisinesByCount()).slice(0, SECTION_COUNT), nearby: false };
}

/** Cuisine facet values, most inventory first. */
async function cuisinesByCount(geo?: {
  aroundLatLng: string;
  aroundRadius: number;
}): Promise<string[]> {
  try {
    const { results } = await searchClient.searchForHits({
      requests: [
        {
          indexName: INDEX_NAME,
          query: "",
          // Facet counts only. Asking for zero hits keeps this cheap; the rows
          // fetch their own restaurants once the browser knows what to ask for.
          hitsPerPage: 0,
          facets: ["cuisines"],
          ...geo,
        },
      ],
    });

    const counts = results[0]?.facets?.cuisines ?? {};
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([value]) => value);
  } catch {
    // A landing page with no cuisine rows still works — Trending carries it.
    // Failing the whole page over a nice-to-have row would be the worse trade.
    return [];
  }
}
