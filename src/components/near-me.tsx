"use client";

import type { Hit } from "instantsearch.js";
import type { Restaurant } from "@/lib/types";
import type { Origin } from "@/lib/use-geolocation";

/**
 * What a diner sees about distance: a line saying results are sorted by it,
 * and the per-card distance itself.
 *
 * There was also a notice when the nearest result was far away — "nearest is
 * 206 km away, this dataset covers 51 US metros". Removed: every card already
 * carries its own distance, so the banner restated what the results were
 * saying and took the top of the page to do it. The coverage gap is still
 * worth raising with the customer; it does not need a permanent fixture in the
 * UI to make the point.
 *
 * No controls here. Distance sorting is the default, and overriding the origin
 * is a testing affordance that lives in demo-panel.tsx.
 */

/**
 * A one-line note on why results are ordered the way they are.
 *
 * Informational, not a control — there is no button here. Distance sorting is
 * the default, and overriding or clearing it lives in the demo panel, because
 * choosing a different city is a testing affordance rather than something a
 * diner does.
 */
export function SortedByDistance({ origin }: { origin: Origin | null }) {
  if (!origin) return null;

  return (
    <span className="text-sm text-grey-500">
      · sorted by distance from{" "}
      <span className="text-ink">{origin.label}</span>
    </span>
  );
}

/**
 * Distance to a hit, in km.
 *
 * Algolia computes this during the geo search and returns it on _rankingInfo,
 * so there is no haversine here and no need to retrieve _geoloc on every hit
 * when distance search is off.
 */
export function distanceKm(hit: Hit<Restaurant> | undefined): number | null {
  const metres = hit?._rankingInfo?.matchedGeoLocation?.distance;
  return typeof metres === "number" ? metres / 1000 : null;
}
