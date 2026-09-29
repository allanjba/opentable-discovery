import { AlgoliaSearchApp } from "@/components/algolia-search-app";
import { resolveOrigin } from "@/lib/ip-origin";
import { topCuisines } from "@/lib/top-cuisines";

/**
 * The search origin is resolved on the server so the first paint is already
 * sorted by distance. See lib/ip-origin.ts for why.
 *
 * The landing page's cuisine rows depend on that origin — they are the cuisines
 * with the most inventory nearby — so the two are sequenced rather than awaited
 * together. One extra server-side round trip buys a first paint that already
 * knows which rows to draw; resolving it in the browser would cost the same trip
 * and delay every row behind it.
 */
export default async function Home() {
  const origin = await resolveOrigin();

  return (
    <main className="flex-1">
      <AlgoliaSearchApp
        initialOrigin={origin}
        topCuisines={await topCuisines(origin)}
      />
    </main>
  );
}
