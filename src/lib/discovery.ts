import { INDEX_NAME, searchClient } from "@/lib/algolia";
import type { Origin } from "@/lib/origin";

/**
 * Which rows the discovery surface shows, resolved on the server.
 *
 * The rows answer "what is worth eating around here", and the only signal this
 * dataset carries for that is how much local inventory each facet value has. On
 * a real engagement this is analytics-driven — Insights events feeding Dynamic
 * Re-ranking, or a Query Suggestions index built from real searches. Neither is
 * possible on a catalogue with no behavioural data, so facet counts stand in,
 * and the substitution is the interesting part to talk about.
 *
 * Resolved server-side, alongside the origin, so the first paint already knows
 * which rows to draw.
 */

/** Two cuisines. More would be more of the same axis rather than more ways in. */
const CUISINE_ROWS = 2;

/**
 * The radius that counts as "around here".
 *
 * Measured at 25 and 50 km: New York goes 895 -> 1,114 restaurants and Miami
 * 37 -> 50, while neither stops being a fair description of "near you". The
 * wider one is chosen because thin local inventory makes for a thin row.
 */
const NEARBY_RADIUS_M = 50_000;

export type Discovery = {
  cuisines: string[];
  /**
   * The densest neighbourhood nearby, or null.
   *
   * A different axis from cuisine, which is the point — a fourth cuisine row
   * would be more of the same. It is also inherently local: "Midtown West" means
   * nothing to someone browsing from London, so unlike the cuisines it has no
   * global fallback and simply does not render.
   */
  neighborhood: string | null;
  /**
   * Whether these came from local inventory.
   *
   * The labels depend on it. A false "near you" is the specific mistake this
   * project already made once with the coverage banner: from Salt Lake City the
   * nearest restaurant is 207 km away, so the rows are still worth showing but
   * calling them local would be a lie.
   */
  nearby: boolean;
};

export async function resolveDiscovery(origin: Origin | null): Promise<Discovery> {
  // aroundRadius "all" — what the page itself uses — sorts by distance without
  // filtering, so facet counts under it are identical to the global ones.
  // Verified: New York returns American 882 / Italian 850, the whole catalogue.
  // Localising the counts needs a bounded radius, hence a separate query.
  if (origin) {
    const local = await facets(["cuisines", "neighborhood"], {
      aroundLatLng: `${origin.lat},${origin.lng}`,
      aroundRadius: NEARBY_RADIUS_M,
    });

    // Worth seeing in a demo: the local order is not the national one. Within
    // 50 km of New York, Italian (260) beats American (153); Miami leads with
    // Italian and Seafood. Nationally American is first everywhere.
    if (local.cuisines?.length) {
      return {
        cuisines: local.cuisines.slice(0, CUISINE_ROWS),
        neighborhood: local.neighborhood?.[0] ?? null,
        nearby: true,
      };
    }
  }

  const global = await facets(["cuisines"]);
  return {
    cuisines: (global.cuisines ?? []).slice(0, CUISINE_ROWS),
    neighborhood: null,
    nearby: false,
  };
}

/** Facet values for each requested attribute, most inventory first. */
async function facets(
  attributes: string[],
  geo?: { aroundLatLng: string; aroundRadius: number },
): Promise<Record<string, string[]>> {
  try {
    const { results } = await searchClient.searchForHits({
      requests: [
        {
          indexName: INDEX_NAME,
          query: "",
          // Facet counts only. The rows fetch their own restaurants once the
          // browser knows what to ask for.
          hitsPerPage: 0,
          facets: attributes,
          ...geo,
        },
      ],
    });

    const found = results[0]?.facets ?? {};
    return Object.fromEntries(
      attributes.map((attribute) => [
        attribute,
        Object.entries(found[attribute] ?? {})
          .sort(([, a], [, b]) => b - a)
          .map(([value]) => value),
      ]),
    );
  } catch {
    // A landing page with fewer rows still works. Failing the whole page over a
    // nice-to-have row would be the worse trade.
    return {};
  }
}
