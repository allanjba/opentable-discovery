"use client";

import { useEffect, useRef } from "react";
import { useInfiniteHits } from "react-instantsearch";
import type { Restaurant } from "@/lib/types";
import type { Origin } from "@/lib/origin";
import type { Discovery } from "@/lib/discovery";
import { RestaurantHit } from "@/components/restaurant-hit";
import { KeepExploring } from "@/components/discovery-home";

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

export function InfiniteResults({
  origin,
  discovery,
}: {
  origin: Origin | null;
  discovery: Discovery;
}) {
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

  // Nothing matched: the discovery rows are the way out, not a dead end.
  if (items.length === 0) {
    return (
      <>
        <NoResults />
        <KeepExploring
          title="Nothing matched — but these are worth a look"
          origin={origin}
          discovery={discovery}
        />
      </>
    );
  }

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
        /*
          Reachable only here, and that is the design rather than a limitation:
          an infinite list has no bottom until it is exhausted, so anything
          placed below it is seen exactly when the user has run out of results
          and not a moment earlier.

          No heading and no rule above it. The list stopping is its own
          announcement — saying "that's everything" and then immediately
          offering more read as a contradiction, and each row below carries its
          own title already.
        */
        <KeepExploring origin={origin} discovery={discovery} />
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
