import Image from "next/image";
import type { Hit } from "instantsearch.js";
import type { Restaurant } from "@/lib/types";
import { Stars } from "@/components/stars";
import { priceSymbols } from "@/components/restaurant-hit";
import { distanceKm } from "@/components/near-me";

/**
 * The compact card, for the discovery rows on the landing page.
 *
 * Three of these sit in a row where one RestaurantHit spans it, so the layout
 * goes vertical and the metadata is cut to what a browsing diner compares on:
 * rating, cuisine, price, distance. Neighbourhood stays because it is the thing
 * that tells two branches of the same chain apart.
 *
 * No <Highlight> here, deliberately: these rows only render when there is no
 * query, so there is nothing to highlight. The wide card keeps it for results.
 */
export function RestaurantCard({ hit }: { hit: Hit<Restaurant> }) {
  const km = distanceKm(hit);

  return (
    <a
      href={hit.reserve_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-w-0 flex-col outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="relative mb-2 aspect-[3/2] w-full overflow-hidden bg-grey-100 transition-shadow group-hover:shadow-md">
        <Image
          src={hit.image_url}
          alt={hit.name}
          fill
          // Three across inside a 1024px column on desktop, two across below.
          sizes="(min-width: 640px) 220px, 45vw"
          className="object-cover object-center"
        />
      </div>

      <h3
        className="truncate font-semibold text-ink transition-colors group-hover:text-brand"
        title={hit.name}
      >
        {hit.name}
      </h3>

      <p className="flex items-center gap-1.5 text-sm">
        <span className="font-semibold text-accent">
          {hit.stars_count.toFixed(1)}
        </span>
        <Stars rating={hit.stars_count} />
        <span className="text-grey-500">({hit.reviews_count.toLocaleString()})</span>
      </p>

      <p className="truncate text-sm text-grey-500" title={hit.neighborhood}>
        {hit.food_type} · {priceSymbols(hit.price)}
        {km !== null && (
          <span className="font-semibold text-brand"> · {formatKm(km)} km</span>
        )}
      </p>

      <p className="truncate text-xs text-grey-400">{hit.neighborhood}</p>
    </a>
  );
}

/** Below 10 km a tenth of a kilometre is meaningful; above it, it is noise. */
function formatKm(km: number): string {
  return km < 10 ? km.toFixed(1) : String(Math.round(km));
}
