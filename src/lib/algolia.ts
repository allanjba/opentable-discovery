import { liteClient } from "algoliasearch/lite";

/**
 * Browser-side Algolia client.
 *
 * Uses the `lite` build, which is search-only and a fraction of the size of the
 * full client — the browser never needs indexing or settings methods.
 *
 * The search key is public by design: it is read-only and ships in the bundle of
 * every Algolia-powered site. The write key must never be exposed, which is why
 * only these two are prefixed NEXT_PUBLIC_.
 */

const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
const searchKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY;

if (!appId || !searchKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_ALGOLIA_APP_ID or NEXT_PUBLIC_ALGOLIA_SEARCH_KEY in .env",
  );
}

export const ALGOLIA_APP_ID = appId;
export const INDEX_NAME = "restaurants";

export const searchClient = liteClient(appId, searchKey);
