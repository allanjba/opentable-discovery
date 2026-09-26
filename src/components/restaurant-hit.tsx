import Image from "next/image";
import { Highlight } from "react-instantsearch";
import type { Hit } from "instantsearch.js";
import type { Restaurant } from "@/lib/types";
import { Stars } from "@/components/stars";
import { distanceKm } from "@/components/near-me";

/**
 * One result card.
 *
 * Lifted out of the search component during the InstantSearch migration: `Hits`
 * renders the list and the `<li>` wrapper itself, and takes the card as
 * `hitComponent`, so the card has to stand alone.
 *
 * Highlighting comes from `<Highlight>` rather than hand-parsing Algolia's
 * markup. Worth knowing why that matters: Algolia returns `<em>` tags around
 * matches but does NOT escape everything else — a name comes back as
 * "Kingfisher <em>Bar</em> & <em>Grill</em>", with a raw ampersand. Rendering
 * that with dangerouslySetInnerHTML means HTML-parsing unescaped data. The
 * widget splits the response into parts and renders them as text nodes, so the
 * 438 restaurant names containing "&" are safe without any escaping of ours.
 */
export function RestaurantHit({ hit }: { hit: Hit<Restaurant> }) {
  // Present only while a distance search is running; Algolia computes it.
  const km = distanceKm(hit);

  return (
    <div className="flex gap-4">
      {/* fill + object-cover crops whatever aspect ratio the source has into a
          fixed 110x86 box, centred */}
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
          <Highlight hit={hit} attribute="name" classNames={HIGHLIGHT} />
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
          <Highlight hit={hit} attribute="food_type" classNames={HIGHLIGHT} />
          {" | "}
          <Highlight hit={hit} attribute="neighborhood" classNames={HIGHLIGHT} />
          {" | "}
          {priceSymbols(hit.price)}
          {km !== null && (
            <span className="font-semibold text-brand">
              {" | "}
              {km < 10 ? km.toFixed(1) : Math.round(km)} km
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Matched text is marked with weight and colour rather than a background, so a
 * highlight inside the grey metadata line does not look like a selection.
 */
const HIGHLIGHT = {
  highlighted: "bg-transparent font-semibold text-brand",
};

/** 2 -> "$$", 3 -> "$$$", 4 -> "$$$$" — the notation OpenTable's own filter uses. */
export function priceSymbols(tier: number | string): string {
  const n = Number(tier);
  return Number.isFinite(n) ? "$".repeat(n) : String(tier);
}
