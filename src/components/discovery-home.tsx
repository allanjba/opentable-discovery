"use client";

import { Configure, Index, useHits, useInstantSearch } from "react-instantsearch";
import type { Hit } from "instantsearch.js";
import { INDEX_NAME } from "@/lib/algolia";
import type { Origin } from "@/lib/origin";
import type { TopCuisines } from "@/lib/top-cuisines";
import type { Restaurant } from "@/lib/types";
import { RestaurantCard } from "@/components/restaurant-card";

/**
 * What the page shows before anyone searches: three curated rows instead of an
 * undifferentiated list of 5,000.
 *
 * This is the discovery persona's half of the brief — "limited ways to browse,
 * refine, or get inspired". A ranked list is browsing; rows with a reason behind
 * them are inspiration.
 *
 * Each cuisine row is its own <Index> scope on the same index, which is how
 * InstantSearch expresses "several queries, one screen". They are batched into a
 * single network request, so three rows cost one round trip, not three.
 *
 * Trending is the exception and gets no scope of its own: the root query is
 * already an empty query against a geo-sorted, popularity-ranked index, which
 * *is* "nearest and best". Slicing its first three is free.
 */

/** Three per row. The grid is built for it and a fourth would wrap badly. */
const ROW_SIZE = 3;

export function DiscoveryHome({
  origin,
  topCuisines,
}: {
  origin: Origin | null;
  topCuisines: TopCuisines;
}) {
  return (
    <div className="space-y-9">
      <TrendingRow nearby={topCuisines.nearby} />

      {topCuisines.values.map((cuisine) => (
        <CuisineRow
          key={cuisine}
          cuisine={cuisine}
          nearby={topCuisines.nearby}
          origin={origin}
        />
      ))}
    </div>
  );
}

/**
 * The nearest good restaurants, read off the page's own results.
 *
 * The header follows the same rule as the cuisine rows: "near you" is only
 * claimed when there is inventory nearby. From Salt Lake City the nearest
 * restaurant in this dataset is 207 km away, and these are still the right three
 * to show — they are just not local.
 */
function TrendingRow({ nearby }: { nearby: boolean }) {
  const { items } = useHits<Restaurant>();

  return (
    <Row
      title={nearby ? "Trending near you" : "Popular right now"}
      hits={items.slice(0, ROW_SIZE)}
    />
  );
}

/**
 * One cuisine row, with its own query and its own way into the full results.
 *
 * `useInstantSearch` is called here rather than inside the <Index> below on
 * purpose: this component sits in the root scope, so "See all" refines the
 * search the sidebar and the results list are looking at. Called one level
 * lower it would refine the row's private scope and nothing visible would
 * happen.
 */
function CuisineRow({
  cuisine,
  nearby,
  origin,
}: {
  cuisine: string;
  nearby: boolean;
  origin: Origin | null;
}) {
  const { setIndexUiState } = useInstantSearch();

  const seeAll = () =>
    setIndexUiState((previous) => ({
      ...previous,
      page: 1,
      refinementList: { ...previous.refinementList, cuisines: [cuisine] },
    }));

  return (
    <Index indexName={INDEX_NAME} indexId={`cuisine-${slug(cuisine)}`}>
      {/*
        A child <Index> does not inherit the page's <Configure>, so the geo
        parameters are passed again here. That is a feature rather than a chore:
        a row can be tuned separately from the results list.

        aroundRadius "all" matches the page — it sorts by distance without
        filtering, so a row still fills from a city the dataset does not cover.
      */}
      <Configure
        filters={`cuisines:"${cuisine}"`}
        hitsPerPage={ROW_SIZE}
        {...(origin
          ? {
              aroundLatLng: `${origin.lat},${origin.lng}`,
              aroundRadius: "all" as const,
              aroundPrecision: 2000,
              getRankingInfo: true,
            }
          : {})}
      />

      <CuisineRowHits
        title={nearby ? `Popular ${cuisine} near you` : `Popular ${cuisine}`}
        seeAllLabel={`See all ${cuisine}`}
        onSeeAll={seeAll}
      />
    </Index>
  );
}

/** Reads the hits from inside the row's own index scope. */
function CuisineRowHits({
  title,
  seeAllLabel,
  onSeeAll,
}: {
  title: string;
  seeAllLabel: string;
  onSeeAll: () => void;
}) {
  const { items } = useHits<Restaurant>();

  // Derived from facet counts, so an empty row should be impossible — but a row
  // with a header and nothing under it is the worse failure, so it hides.
  if (items.length === 0) return null;

  return (
    <Row title={title} hits={items} seeAllLabel={seeAllLabel} onSeeAll={onSeeAll} />
  );
}

/** A titled row of up to three compact cards. */
function Row({
  title,
  hits,
  seeAllLabel,
  onSeeAll,
}: {
  title: string;
  hits: Hit<Restaurant>[];
  seeAllLabel?: string;
  onSeeAll?: () => void;
}) {
  if (hits.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-grey-200 pb-2">
        <h2 className="font-semibold text-ink">{title}</h2>

        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="shrink-0 cursor-pointer text-sm font-semibold text-brand hover:underline"
          >
            {seeAllLabel} →
          </button>
        )}
      </div>

      {/*
        Two across on a phone, three from sm up. One across was the first
        version and it made each card a full-width 3:2 image — three of them
        filled two and a half screens, so the second row was unreachable
        without scrolling past the first.

        The third card hides rather than wrapping to a row of its own, because
        a lone card under a pair reads as a layout mistake. Two is a complete
        thought; two plus a widow is not.
      */}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5">
        {hits.map((hit, index) => (
          <li
            key={hit.objectID}
            className={index === 2 ? "hidden min-w-0 sm:block" : "min-w-0"}
          >
            <RestaurantCard hit={hit} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Contemporary American" -> "contemporary-american", for a stable indexId. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
