"use client";

import { Configure, Index, useHits, useInstantSearch } from "react-instantsearch";
import type { Hit } from "instantsearch.js";
import { INDEX_NAME } from "@/lib/algolia";
import type { Origin } from "@/lib/origin";
import type { Discovery } from "@/lib/discovery";
import type { Restaurant } from "@/lib/types";
import { RestaurantCard } from "@/components/restaurant-card";

/**
 * Curated rows instead of an undifferentiated list, used in two places: the
 * landing state before anyone searches, and below a search that found little or
 * nothing.
 *
 * This is the discovery persona's half of the brief — "limited ways to browse,
 * refine, or get inspired". A ranked list is browsing; rows with a reason
 * attached are inspiration. The rows deliberately sit on *different* axes —
 * popularity, cuisine, neighbourhood — because a fourth cuisine row would be
 * more of the same thing rather than another way in.
 *
 * Every row is its own <Index> scope on the same index, which is how
 * InstantSearch expresses "several queries, one screen". They batch into a
 * single network request, so four rows cost one round trip.
 */

/** Three per row. The grid is built for it and a fourth would wrap badly. */
const ROW_SIZE = 3;

type Scope = "home" | "explore";

export function DiscoveryHome(props: {
  origin: Origin | null;
  discovery: Discovery;
}) {
  return <Rows {...props} scope="home" />;
}

/**
 * The same rows, below a result list that ran out.
 *
 * Only reachable when there is nothing more to scroll — an infinite list has no
 * bottom until it is exhausted — which is exactly when a way out is useful.
 */
export function KeepExploring({
  title,
  ...props
}: {
  title: string;
  origin: Origin | null;
  discovery: Discovery;
}) {
  return (
    <section className="mt-10 border-t border-grey-200 pt-8">
      <h2 className="mb-6 text-lg font-semibold text-ink">{title}</h2>
      <Rows {...props} scope="explore" />
    </section>
  );
}

function Rows({
  origin,
  discovery,
  scope,
}: {
  origin: Origin | null;
  discovery: Discovery;
  scope: Scope;
}) {
  const { nearby, cuisines, neighborhood } = discovery;

  return (
    <div className="space-y-9">
      <DiscoveryRow
        scope={scope}
        id="trending"
        origin={origin}
        title={nearby ? "Trending near you" : "Popular right now"}
      />

      {cuisines.map((cuisine) => (
        <DiscoveryRow
          key={cuisine}
          scope={scope}
          id={`cuisine-${slug(cuisine)}`}
          origin={origin}
          filters={`cuisines:"${cuisine}"`}
          title={nearby ? `Popular ${cuisine} near you` : `Popular ${cuisine}`}
          seeAll={{ label: `See all ${cuisine}`, refine: { cuisine } }}
        />
      ))}

      {/*
        Only rendered when there is inventory nearby, and that is not a
        nicety: a neighbourhood is inherently local, so "Midtown West" means
        nothing to someone browsing from a city this dataset does not cover.
        The cuisines have a global fallback; this row simply does not appear.
      */}
      {neighborhood && (
        <DiscoveryRow
          scope={scope}
          id={`neighborhood-${slug(neighborhood)}`}
          origin={origin}
          filters={`neighborhood:"${neighborhood}"`}
          title={`Explore ${neighborhood}`}
          seeAll={{ label: `See all ${neighborhood}`, query: neighborhood }}
        />
      )}
    </div>
  );
}

type SeeAll = { label: string; refine?: { cuisine: string }; query?: string };

/**
 * One row: its own query, its own reason, and its own way into the full results.
 *
 * `useInstantSearch` is called here rather than inside the <Index> below on
 * purpose. This component sits in the root scope, so "See all" refines the
 * search the sidebar and result list are looking at. Called one level lower it
 * would refine the row's private scope and nothing visible would happen.
 */
function DiscoveryRow({
  scope,
  id,
  origin,
  title,
  filters,
  seeAll,
}: {
  scope: Scope;
  id: string;
  origin: Origin | null;
  title: string;
  filters?: string;
  seeAll?: SeeAll;
}) {
  const { setIndexUiState } = useInstantSearch();

  // Typed explicitly: a ternary here widens to `{cuisines: string[]} | {}`,
  // which does not satisfy the index UI state's `Record<string, string[]>`.
  const refinementList: Record<string, string[]> = seeAll?.refine
    ? { cuisines: [seeAll.refine.cuisine] }
    : {};

  const onSeeAll = () =>
    setIndexUiState((previous) => ({
      ...previous,
      page: 1,
      // The query is cleared, not kept. Below a search that found nothing,
      // layering a cuisine onto the query that failed would just fail again.
      query: seeAll?.query ?? "",
      // Replaced rather than merged, for the same reason: a leftover filter
      // from the search being escaped is not something the user asked to keep.
      refinementList,
    }));

  return (
    <Index indexName={INDEX_NAME} indexId={`discovery-${scope}-${id}`}>
      {/*
        A child <Index> inherits the parent's query and does not inherit its
        <Configure>, so both are set explicitly. query="" is what lets these
        rows sit underneath a search: without it, "Popular Italian" below a
        search for a misspelled name would search for that name too.

        aroundRadius "all" matches the page — it sorts by distance without
        filtering, so a row still fills from a city the dataset does not cover.
      */}
      <Configure
        query=""
        filters={filters}
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

      <RowHits title={title} seeAll={seeAll} onSeeAll={onSeeAll} />
    </Index>
  );
}

/** Reads the hits from inside the row's own index scope. */
function RowHits({
  title,
  seeAll,
  onSeeAll,
}: {
  title: string;
  seeAll?: SeeAll;
  onSeeAll: () => void;
}) {
  const { items } = useHits<Restaurant>();

  // Derived from facet counts, so an empty row should be impossible — but a
  // header with nothing under it is the worse failure, so it hides.
  if (items.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-grey-200 pb-2">
        <h2 className="font-semibold text-ink">{title}</h2>

        {seeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            className="shrink-0 cursor-pointer text-sm font-semibold text-brand hover:underline"
          >
            {seeAll.label} →
          </button>
        )}
      </div>

      <Grid hits={items} />
    </section>
  );
}

/**
 * Two across on a phone, three from sm up.
 *
 * One across was the first version and it made each card a full-width 3:2
 * image — three of them filled two and a half screens, so the second row was
 * unreachable without scrolling past the first. The third card hides rather
 * than wrapping to a row of its own: a lone card under a pair reads as a layout
 * mistake. Two is a complete thought; two plus a widow is not.
 */
function Grid({ hits }: { hits: Hit<Restaurant>[] }) {
  return (
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
  );
}

/** "Contemporary American" -> "contemporary-american", for a stable indexId. */
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
