import { AlgoliaSearchApp } from "@/components/algolia-search-app";
import { ipOrigin } from "@/lib/ip-origin";

/**
 * The search origin is resolved on the server so the first paint is already
 * sorted by distance. See lib/ip-origin.ts for why.
 */
export default async function Home() {
  return (
    <main className="flex-1">
      <AlgoliaSearchApp initialOrigin={await ipOrigin()} />
    </main>
  );
}
