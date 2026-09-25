"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Restaurant } from "@/lib/types";
import { Stars } from "@/components/stars";
import { INDEX_NAME, searchClient } from "@/lib/algolia";

/**
 * The facet groups shown in the sidebar, in order.
 *
 * `limit` is how many values to show before the long tail is cut. Cuisine has
 * 116 values so it needs a hard cut; dining style has four and price three, so
 * they are shown whole.
 */
type FacetConfig = {
  attribute: string;
  label: string;
  /** How many values to show before the long tail is cut. */
  limit: number;
  /** Sort by the value itself rather than by count — for ordered tiers. */
  sortByValue?: boolean;
  /** Render the raw facet value for display. */
  format?: (value: string) => string;
};

const FACETS: FacetConfig[] = [
  { attribute: "cuisines", label: "Cuisine/Food Type", limit: 7 },
  { attribute: "dining_style", label: "Dining Style", limit: 10 },
  {
    attribute: "price",
    label: "Price",
    limit: 10,
    // Price tiers are 2, 3 and 4 — sort by the tier, not by popularity.
    sortByValue: true,
    format: priceSymbols,
  },
];

/** 2 -> "$$", 3 -> "$$$", 4 -> "$$$$" — the notation OpenTable's own filter uses. */
function priceSymbols(tier: number | string): string {
  const n = Number(tier);
  return Number.isFinite(n) ? "$".repeat(n) : String(tier);
}

const BROWSE_LIMIT = 3;
const PAGE_SIZE = 10;

type FacetValue = { value: string; count: number };
type Refinements = Record<string, string[]>;

type SearchState = {
  hits: Restaurant[];
  total: number;
  facets: Record<string, FacetValue[]>;
  elapsedMs: number;
};

/** Algolia's facetFilters shape: nested array = OR within a facet, outer = AND. */
function toFacetFilters(refinements: Refinements, skip?: string): string[][] {
  return Object.entries(refinements)
    .filter(([attribute, values]) => attribute !== skip && values.length > 0)
    .map(([attribute, values]) => values.map((v) => `${attribute}:${v}`));
}

export function AlgoliaSearchApp() {
  const [state, setState] = useState<SearchState | null>(null);
  const [query, setQuery] = useState("");
  const [refinements, setRefinements] = useState<Refinements>({});
  const [limit, setLimit] = useState(BROWSE_LIMIT);

  // No debouncing — Algolia's guidance is that search-as-you-type is the
  // intended experience and debouncing is what you turn on for slow networks.
  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();

    // Disjunctive faceting. One request for the hits with every refinement
    // applied, then one request per facet with *that facet's own* refinement
    // removed. Without this, selecting "Italian" drops every other cuisine to
    // zero and a second value can never be chosen.
    //
    // All of them go out in a single network round trip.
    searchClient
      .searchForHits<Restaurant>({
        requests: [
          {
            indexName: INDEX_NAME,
            query,
            hitsPerPage: limit,
            facetFilters: toFacetFilters(refinements),
          },
          ...FACETS.map(({ attribute }) => ({
            indexName: INDEX_NAME,
            query,
            hitsPerPage: 0,
            facets: [attribute],
            facetFilters: toFacetFilters(refinements, attribute),
          })),
        ],
      })
      .then(({ results }) => {
        if (cancelled) return;

        const [hitsResult, ...facetResults] = results;
        const facets: Record<string, FacetValue[]> = {};

        FACETS.forEach(({ attribute, limit: facetLimit }, index) => {
          const counts = facetResults[index].facets?.[attribute] ?? {};
          const ordered = Object.entries(counts)
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count);

          if (FACETS[index].sortByValue) {
            ordered.sort((a, b) => Number(a.value) - Number(b.value));
          }

          const top = ordered.slice(0, facetLimit);
          // A selected value must stay visible even when it falls outside the
          // top N, or the filter narrowing the results becomes invisible.
          const pinned = (refinements[attribute] ?? [])
            .filter((value) => !top.some((f) => f.value === value))
            .map((value) => ({
              value,
              count: ordered.find((f) => f.value === value)?.count ?? 0,
            }));

          facets[attribute] = [...top, ...pinned];
        });

        setState({
          hits: hitsResult.hits,
          total: hitsResult.nbHits ?? 0,
          facets,
          elapsedMs: performance.now() - startedAt,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [query, refinements, limit]);

  function resetLimit(nextQuery: string, nextRefinements: Refinements) {
    const browsing =
      nextQuery.trim().length === 0 &&
      Object.values(nextRefinements).every((values) => values.length === 0);
    setLimit(browsing ? BROWSE_LIMIT : PAGE_SIZE);
  }

  function updateQuery(value: string) {
    setQuery(value);
    resetLimit(value, refinements);
  }

  function toggleRefinement(attribute: string, value: string) {
    const current = refinements[attribute] ?? [];
    const next = {
      ...refinements,
      [attribute]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    };
    setRefinements(next);
    resetLimit(query, next);
  }

  function clearAll() {
    setQuery("");
    setRefinements({});
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
          {FACETS.map(({ attribute, label, format }) => (
            <div key={attribute} className="mb-7 last:mb-0">
              <h2 className="mb-3 font-semibold text-ink">{label}</h2>
              <ul>
                {(state?.facets[attribute] ?? []).map((facet) => {
                  const active = (refinements[attribute] ?? []).includes(
                    facet.value,
                  );
                  return (
                    <li key={facet.value}>
                      <button
                        type="button"
                        onClick={() => toggleRefinement(attribute, facet.value)}
                        className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[15px] ${
                          active
                            ? "bg-brand text-white"
                            : "text-ink hover:bg-grey-100"
                        }`}
                      >
                        <span className="truncate">
                          {format ? format(facet.value) : facet.value}
                        </span>
                        <span
                          className={`ml-2 shrink-0 ${active ? "text-white" : "text-grey-400"}`}
                        >
                          {facet.count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
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
                          {priceSymbols(hit.price)}
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
