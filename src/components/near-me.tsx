"use client";

import { useHits, useInstantSearch } from "react-instantsearch";
import type { Hit } from "instantsearch.js";
import type { Restaurant } from "@/lib/types";
import type { Origin } from "@/lib/use-geolocation";

/**
 * What a diner sees about distance: a line saying results are sorted by it,
 * and a notice when the nearest one is a long way away.
 *
 * No controls. Distance sorting is the default and asked for on load;
 * overriding the origin is a testing affordance and lives in demo-panel.tsx.
 */

/** Beyond this, "near me" is not answering the question the user asked. */
const COVERAGE_LIMIT_KM = 50;

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
 * Shown when the nearest result is a long way off.
 *
 * Two different facts wear the same shape here, and the first version conflated
 * them. Browsing from Salt Lake City, the nearest restaurant really is 207 km
 * away and the dataset really has no Utah inventory — that is a coverage
 * statement. But searching "New York" from Miami ALSO returns a first hit 1,676
 * km away, and concluding "there is no inventory near Miami" from that is
 * simply false: Miami has 32 restaurants within 10 km. Nothing matching the
 * query is near Miami, which is a different sentence.
 *
 * So the message branches on whether the user is searching or browsing. Only
 * the browsing case can claim anything about coverage.
 */
export function CoverageNotice({ origin }: { origin: Origin | null }) {
  const { items } = useHits<Restaurant>();
  const { indexUiState } = useInstantSearch();

  if (!origin) return null;

  const nearestKm = distanceKm(items[0]);
  if (nearestKm === null || nearestKm <= COVERAGE_LIMIT_KM) return null;

  const query = indexUiState.query?.trim() ?? "";
  const refined = Object.values(indexUiState.refinementList ?? {}).some(
    (values) => values.length > 0,
  );
  const searching = query.length > 0 || refined;
  const distance = (
    <span className="font-semibold">{Math.round(nearestKm)} km</span>
  );

  return (
    <div className="mb-6 border border-accent bg-accent/10 px-4 py-3 text-sm">
      <p className="text-ink">
        {searching ? (
          <>
            Nothing matching{" "}
            {query ? <em>&ldquo;{query}&rdquo;</em> : "these filters"} near{" "}
            {origin.label} — the closest is {distance} away.
          </>
        ) : (
          <>
            Nearest restaurant is {distance} away. This dataset covers 51 US
            metros — there is no inventory near {origin.label}.
          </>
        )}
      </p>
    </div>
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
