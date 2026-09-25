"use client";

import { useEffect, useMemo, useState } from "react";
import type { Restaurant } from "@/lib/types";
import { Stars } from "@/components/stars";
import { cuisineCounts, naiveSearch } from "@/lib/naive-search";
import Image from "next/image";

// The current experience shows seven cuisines with no overflow control.
const FACET_LIMIT = 7;

// Browsing with no query shows three results, as the current experience does.
// Once the user actually searches or refines, a page is ten.
const BROWSE_LIMIT = 3;
const PAGE_SIZE = 10;

export function NaiveSearchApp() {
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [loadMs, setLoadMs] = useState(0);
  const [query, setQuery] = useState("");
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [limit, setLimit] = useState(BROWSE_LIMIT);

  // The whole dataset is downloaded to the browser before anything is
  // searchable. That cost is part of what we are replacing.
  useEffect(() => {
    const startedAt = performance.now();
    fetch("/data/restaurants.json")
      .then((response) => response.json())
      .then((data: Restaurant[]) => {
        setRestaurants(data);
        setLoadMs(performance.now() - startedAt);
      });
  }, []);

  const facets = useMemo(() => {
    if (!restaurants) return [];

    const counts = cuisineCounts(restaurants, query);
    const top = counts.slice(0, FACET_LIMIT);

    // A selected cuisine has to stay visible even when it drops out of the top
    // N for the current query. Otherwise the filter is still narrowing results
    // with no way for the user to see it or turn it off — which reads as
    // "the search is broken".
    const pinned = cuisines
      .filter((value) => !top.some((facet) => facet.value === value))
      .map((value) => ({
        value,
        count: counts.find((facet) => facet.value === value)?.count ?? 0,
      }));

    return [...top, ...pinned];
  }, [restaurants, query, cuisines]);

  const result = useMemo(
    () =>
      restaurants ? naiveSearch(restaurants, query, cuisines, limit) : null,
    [restaurants, query, cuisines, limit],
  );

  /** Any new query or refinement starts a fresh page count. */
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

          {restaurants === null ? (
            <p className="text-sm text-grey-500">Loading…</p>
          ) : (
            <ul>
              {facets.map((facet) => {
                const active = cuisines.includes(facet.value);
                return (
                  <li key={facet.value}>
                    <button
                      type="button"
                      onClick={() => toggleCuisine(facet.value)}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[15px] ${
                        active
                          ? "bg-brand text-white"
                          : "text-ink hover:bg-grey-100"
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
          )}
        </aside>

        <section className="min-w-0 flex-1 p-6">
          {result === null ? (
            <p className="text-sm text-grey-500">
              Downloading 5,000 records to the browser…
            </p>
          ) : (
            <>
              <div className="mb-6 flex items-baseline gap-2 border-b border-grey-200 pb-3">
                <span className="font-semibold text-ink">
                  {result.total.toLocaleString()} results found
                </span>
                <span className="text-sm text-grey-500">
                  in {(result.elapsedMs / 1000).toFixed(3)} seconds
                </span>
                <span className="ml-auto text-xs text-grey-400">
                  {(loadMs / 1000).toFixed(2)}s initial download
                </span>
              </div>

              {result.hits.length === 0 ? (
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
                  {result.hits.map((hit) => (
                    <li key={hit.objectID} className="flex gap-4">
                      {/* fill + object-cover crops whatever aspect ratio the
                          source has into a fixed 110x86 box, centred */}
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
                        <p className="flex items-center gap-1.5 text-sm">
                          <span className="font-semibold text-accent">
                            {hit.stars_count.toFixed(1)}
                          </span>
                          <Stars rating={hit.stars_count} />
                          <span className="text-grey-500">
                            ({hit.reviews_count.toLocaleString()} reviews)
                          </span>
                        </p>
                        <p className="truncate text-sm text-grey-500">
                          {hit.food_type} | {hit.neighborhood} |{" "}
                          {hit.price_range}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {result.total > result.hits.length && (
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
