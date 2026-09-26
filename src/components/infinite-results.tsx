"use client";

import { useEffect, useRef } from "react";
import { useInfiniteHits } from "react-instantsearch";
import type { Restaurant } from "@/lib/types";
import { RestaurantHit } from "@/components/restaurant-hit";

/**
 * The results list, loading more as the user reaches the bottom.
 *
 * InstantSearch has no auto-loading widget — `<InfiniteHits>` gives you a "show
 * more" button and stops there. Algolia's own guidance is to drop to the
 * `useInfiniteHits` hook and watch a sentinel element with an
 * IntersectionObserver, which is what this is.
 *
 * `items` is cumulative across pages; the hook keeps the cache, so this renders
 * everything loaded so far rather than just the newest page.
 */

/** Start loading this far before the sentinel is actually visible. */
const PRELOAD_MARGIN = "400px";

export function InfiniteResults() {
  const { items, isLastPage, showMore } = useInfiniteHits<Restaurant>();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) showMore();
      },
      { rootMargin: PRELOAD_MARGIN },
    );

    observer.observe(target);
    return () => observer.disconnect();
    // items.length is a dependency on purpose. An IntersectionObserver only
    // fires when an element *crosses* the threshold, so if a page is short
    // enough that the sentinel is still on screen after loading, no second
    // event ever arrives and the list stalls. Rebuilding the observer after
    // each page re-fires it immediately while the sentinel remains visible,
    // which fills the viewport and then stops.
  }, [isLastPage, showMore, items.length]);

  if (items.length === 0) return <NoResults />;

  return (
    <>
      <ol className="space-y-6">
        {items.map((hit) => (
          <li key={hit.objectID}>
            <RestaurantHit hit={hit} />
          </li>
        ))}
      </ol>

      {isLastPage ? (
        <p className="mt-8 text-center text-sm text-grey-400">
          That&apos;s everything.
        </p>
      ) : (
        <div ref={sentinel} aria-hidden className="h-px" />
      )}
    </>
  );
}

function NoResults() {
  return (
    <div className="py-10 text-center text-ink">
      <p>No restaurants matched.</p>
      <p className="mt-1 text-sm text-grey-500">
        Try fewer words, or clear a filter.
      </p>
    </div>
  );
}
