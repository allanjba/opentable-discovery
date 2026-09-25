"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Restaurant } from "@/lib/types";
import { INDEX_NAME, searchClient } from "@/lib/algolia";

const FACET_LIMIT = 7;
const BROWSE_LIMIT = 3;
const PAGE_SIZE = 10;

type Facet = { value: string; count: number };

type SearchState = {
  hits: Restaurant[];
  total: number;
  facets: Facet[];
  elapsedMs: number;
};

export function AlgoliaSearchApp() {
  const [state, setState] = useState<SearchState | null>(null);
  const [query, setQuery] = useState("");
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [limit, setLimit] = useState(BROWSE_LIMIT);

  // No debouncing. Algolia's own guidance is that search-as-you-type is the
  // intended experience and debouncing is the thing you turn ON for slow
  // networks or QPS limits, not the default.
  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();

    // Two requests, batched into one network round trip.
    //
    // This is disjunctive faceting. A single query would apply facetFilters to
    // both the hits and the facet counts, so selecting "Italian" would drop
    // every other cuisine to zero and you could never pick a second one. The
    // counts for a facet have to be computed with that facet's own filter
    // removed, so they answer "what would I get if I also picked this?" rather
    // than "what matches right now?".
    //
    //   [0] the hits — query + the cuisine filter
    //   [1] the facet counts — same query, WITHOUT the cuisine filter
    const facetFilters =
      cuisines.length > 0
        ? // A nested array is OR within the facet: Italian OR Japanese.
          [cuisines.map((value) => `cuisines:${value}`)]
        : undefined;

    searchClient
      .searchForHits<Restaurant>({
        requests: [
          {
            indexName: INDEX_NAME,
            query,
            hitsPerPage: limit,
            facetFilters,
          },
          {
            indexName: INDEX_NAME,
            query,
            hitsPerPage: 0,
            facets: ["cuisines"],
          },
        ],
      })
      .then(({ results }) => {
        if (cancelled) return;

        const [hitsResult, facetsResult] = results;
        const counts: Record<string, number> = facetsResult.facets?.cuisines ?? {};
        const ordered: Facet[] = Object.entries(counts)
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);

        const top = ordered.slice(0, FACET_LIMIT);
        // Same rule as the old implementation: a selected cuisine must stay
        // visible even when it falls outside the top N, or the user cannot see
        // or remove the filter that is hiding their results.
        const pinned = cuisines
          .filter((value) => !top.some((facet) => facet.value === value))
          .map((value) => ({
            value,
            count: ordered.find((facet) => facet.value === value)?.count ?? 0,
          }));

        setState({
          hits: hitsResult.hits,
          total: hitsResult.nbHits ?? 0,
          facets: [...top, ...pinned],
          elapsedMs: performance.now() - startedAt,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [query, cuisines, limit]);

  function resetLimit(nextQuery: string, nextCuisines: string[]) {
    const browsing = nextQuery.trim().length === 0 && nextCuisines.length === 0;
    setLimit(browsing ? BROWSE_LIMIT : PAGE_SIZE);
  }

  function updateQuery(value: string) {
    setQuery(value);
    resetLimit(value, cuisines);
  }

  function toggleCuisine(value: string) {
    const next = cuisines.includes(value)
      ? cuisines.filter((item) => item !== value)
      : [...cuisines, value];
    setCuisines(next);
    resetLimit(query, next);
  }

  function clearAll() {
    setQuery("");
    setCuisines([]);
    setLimit(BROWSE_LIMIT);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="bg-brand-dark p-6 shadow-md">
        <input
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="Search for Restaurants by Name, Cuisine, Location"
          className="w-full bg-surface px-5 py-3 text-lg text-ink outline-none
                     placeholder:text-grey-400 focus:ring-2 focus:ring-brand"
        />
      </div>

      <div className="flex flex-col bg-surface shadow-md sm:flex-row">
        <aside className="w-full border-grey-200 p-6 sm:w-64 sm:shrink-0 sm:border-r">
          <h2 className="mb-4 font-semibold text-ink">Cuisine/Food Type</h2>
          <ul>
            {(state?.facets ?? []).map((facet) => {
              const active = cuisines.includes(facet.value);
              return (
                <li key={facet.value}>
                  <button
                    type="button"
                    onClick={() => toggleCuisine(facet.value)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[15px] ${
                      active ? "bg-brand text-white" : "text-ink hover:bg-grey-100"
                    }`}
                  >
                    <span>{facet.value}</span>
                    <span className={active ? "text-white" : "text-grey-400"}>
                      {facet.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="min-w-0 flex-1 p-6">
          {state === null ? (
            <p className="text-sm text-grey-500">Searching…</p>
          ) : (
            <>
              <div className="mb-6 flex items-baseline gap-2 border-b border-grey-200 pb-3">
                <span className="font-semibold text-ink">
                  {state.total.toLocaleString()} results found
                </span>
                <span className="text-sm text-grey-500">
                  in {(state.elapsedMs / 1000).toFixed(3)} seconds
                </span>
                <Link
                  href="/old"
                  className="ml-auto text-xs text-grey-400 underline hover:text-brand"
                >
                  view current experience
                </Link>
              </div>

              {state.hits.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-ink">
                    We didn&apos;t find any results for the search{" "}
                    <em>&ldquo;{query}&rdquo;</em>.
                  </p>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="mt-3 text-brand underline"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <ul className="space-y-6">
                  {state.hits.map((hit) => (
                    <li key={hit.objectID} className="flex gap-4">
                      <div className="relative h-[86px] w-[110px] shrink-0 overflow-hidden bg-grey-100">
                        <Image
                          src={hit.image_url}
                          alt={hit.name}
                          fill
                          sizes="110px"
                          className="object-cover object-center"
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-semibold text-ink">
                          {hit.name}
                        </h3>
                        <p className="text-sm">
                          <span className="font-semibold text-accent">
                            {hit.stars_count.toFixed(1)}
                          </span>{" "}
                          <span className="text-grey-500">
                            ({hit.reviews_count.toLocaleString()} reviews)
                          </span>
                        </p>
                        <p className="truncate text-sm text-grey-500">
                          {hit.food_type} | {hit.neighborhood} | {hit.price_range}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {state.total > state.hits.length && (
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setLimit((current) => current + PAGE_SIZE)}
                    className="border border-grey-300 px-10 py-2.5 text-ink hover:bg-grey-100"
                  >
                    Show More
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
