"use client";

import {
  Configure,
  RefinementList,
  useStats,
} from "react-instantsearch";
import { InstantSearchNext } from "react-instantsearch-nextjs";
import type { RefinementListProps } from "react-instantsearch";
import { INDEX_NAME, searchClient } from "@/lib/algolia";
import { priceSymbols } from "@/components/restaurant-hit";
import { InfiniteResults } from "@/components/infinite-results";
import { SearchAutocomplete } from "@/components/autocomplete";
import { CoverageNotice, SortedByDistance } from "@/components/near-me";
import { DemoPanel } from "@/components/demo-panel";
import { useGeolocation } from "@/lib/use-geolocation";

/**
 * The search experience, built on React InstantSearch.
 *
 * This replaced a hand-rolled query layer. The hand-rolled version worked and
 * is worth having written — it is how we learned that multi-facet sidebars need
 * disjunctive faceting, and that it fails silently on the *second* click. But
 * `RefinementList` does that on its own, so the batching logic is gone rather
 * than maintained, along with the paging, the stale-response guards and the
 * pinning of selected facet values.
 *
 * Algolia's own guidance is to use the library; hand-rolling it was the thing
 * to do once, to understand what the library is doing.
 */

/**
 * One page size everywhere.
 *
 * Browsing used to show three, mirroring the mockup's empty state. Infinite
 * scroll makes that unreachable: the sentinel is on screen at first paint, so a
 * second page loads before anyone sees three. Keeping it only meant loading
 * three at a time — five round trips for fifteen results.
 */
const PAGE_SIZE = 10;

export function AlgoliaSearchApp() {
  const geo = useGeolocation();

  return (
    <InstantSearchNext
      indexName={INDEX_NAME}
      searchClient={searchClient}
      // `future` opts into the v8 behaviour now so the upgrade is not a
      // breaking change later; both flags are the v8 defaults.
      future={{ preserveSharedStateOnUnmount: true, persistHierarchicalRootCount: true }}
    >
      <DemoPanel
        status={geo.status}
        origin={geo.origin}
        onRequest={geo.request}
        onPreset={geo.usePreset}
        onClear={geo.clear}
      />

      <Configure hitsPerPage={PAGE_SIZE} />

      {/*
        Geo parameters only exist while the user has asked for distance search.
        Rendering <Configure> conditionally is how a search parameter is turned
        off in InstantSearch — omitting it restores the previous behaviour
        exactly, which matters because Geo is ranking criterion #2 and would
        otherwise outrank everything the user actually typed.

        aroundRadius "all" sorts by distance without filtering. A fixed radius
        would return zero results from anywhere the dataset does not cover.

        aroundPrecision groups distances into 2 km buckets, so restaurants in
        the same neighbourhood tie on Geo and fall through to relevance and
        popularity. At the 10 m default, distance alone would order everything
        and popularity_score would never get a say.
      */}
      {geo.status === "on" && geo.origin && (
        <Configure
          aroundLatLng={`${geo.origin.lat},${geo.origin.lng}`}
          aroundRadius="all"
          aroundPrecision={2000}
          getRankingInfo
        />
      )}

      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        {/*
          Sticky rather than an inner scroll container. Letting the page scroll
          and pinning the chrome keeps one scrollbar, keeps the
          IntersectionObserver on its default viewport root, and avoids the
          nested-scroll behaviour that goes wrong on touch devices.
        */}
        <div className="sticky top-0 z-50 bg-brand-dark p-6 shadow-md">
          <SearchAutocomplete origin={geo.origin} />
        </div>

        <div className="flex flex-col bg-surface shadow-md sm:flex-row">
          {/*
            `self-start` matters: a flex child stretches to the row height by
            default, and a full-height element has nothing to stick to. The
            offset clears the search bar, and the facet list scrolls internally
            if it ever outgrows the viewport.
          */}
          <aside className="w-full border-grey-200 p-6 sm:sticky sm:top-[6.5rem] sm:max-h-[calc(100vh-6.5rem)] sm:w-64 sm:shrink-0 sm:self-start sm:overflow-y-auto sm:border-r">
            <Facet attribute="cuisines" label="Cuisine/Food Type" limit={7} />
            <Facet attribute="dining_style" label="Dining Style" limit={10} />
            <Facet
              attribute="price"
              label="Price"
              limit={10}
              // Price tiers are 2, 3 and 4 — order by the tier, not by
              // popularity, and render them the way their own filter does.
              sortBy={["name:asc"]}
              transformItems={(items) =>
                items.map((item) => ({ ...item, label: priceSymbols(item.value) }))
              }
            />
          </aside>

          <section className="min-w-0 flex-1 p-6">
            <div className="mb-6 flex flex-wrap items-baseline gap-2 border-b border-grey-200 pb-3">
              <ResultStats />
              <SortedByDistance origin={geo.origin} />
            </div>

            <CoverageNotice origin={geo.origin} />

            <InfiniteResults />
          </section>
        </div>
      </div>
    </InstantSearchNext>
  );
}

type FacetProps = {
  label: string;
} & Pick<
  RefinementListProps,
  "attribute" | "limit" | "sortBy" | "transformItems"
>;

/**
 * One facet group in the sidebar.
 *
 * `RefinementList` defaults to sortBy ['isRefined', 'count:desc', 'name:asc'],
 * which keeps a selected value visible even when it falls outside the top N.
 * We had to build that by hand before; it is the library's default.
 */
function Facet({ label, ...props }: FacetProps) {
  return (
    <div className="mb-7 last:mb-0">
      <h2 className="mb-3 font-semibold text-ink">{label}</h2>
      <RefinementList
        {...props}
        classNames={{
          list: "space-y-0",
          item: "",
          label:
            "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-[15px] text-ink hover:bg-grey-100",
          // hover:bg-grey-100 on the label would otherwise win over the
          // selected background, so a selected row turns grey under the cursor
          // and reads as if it is being deselected.
          selectedItem:
            "[&_label]:bg-brand [&_label]:hover:bg-brand [&_label]:text-white [&_.ais-RefinementList-count]:text-white",
          checkbox: "sr-only",
          labelText: "truncate",
          count: "shrink-0 text-grey-400",
        }}
      />
    </div>
  );
}

/**
 * The result count and server-side timing.
 *
 * `<Stats>` renders a single string, and this needs two differently styled
 * halves, so it uses the headless hook. Every widget has one — the hook is the
 * escape hatch when the markup matters more than the default.
 *
 * processingTimeMS is Algolia's own server time, not a stopwatch around fetch,
 * so it no longer includes our network latency the way the hand-rolled version
 * did.
 */
function ResultStats() {
  const { nbHits, processingTimeMS } = useStats();

  return (
    <>
      <span className="font-semibold text-ink">
        {nbHits.toLocaleString()} {nbHits === 1 ? "result" : "results"} found
      </span>
      <span className="text-sm text-grey-500">
        in {(processingTimeMS / 1000).toFixed(3)} seconds
      </span>
    </>
  );
}

