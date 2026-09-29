import { headers } from "next/headers";
import type { Origin } from "@/lib/use-geolocation";

/**
 * A rough search origin, taken from the request's IP before the page renders.
 *
 * This exists to kill a flicker. Asking the browser for a location happens
 * after hydration, so the first paint had no origin, the results arrived
 * unsorted, and then swapped a few hundred milliseconds later when the
 * permission resolved. Reading the location server-side means the HTML is
 * already sorted by distance — there is nothing to swap.
 *
 * It also removes the permission prompt from page load, which was an
 * unprompted interruption for something the visitor never asked for. Precise
 * location is still available, but now as an upgrade rather than a toll gate.
 *
 * Vercel attaches these headers to every request. They are absent locally, in
 * which case there is simply no origin and the app behaves as it did before —
 * use the demo panel to set one.
 *
 * Accuracy is city-level at best, which is all that is needed: `aroundPrecision`
 * buckets distances at 2 km, so a few hundred metres of IP error changes
 * nothing about the ordering.
 */
export async function ipOrigin(): Promise<Origin | null> {
  const requestHeaders = await headers();

  const lat = Number(requestHeaders.get("x-vercel-ip-latitude"));
  const lng = Number(requestHeaders.get("x-vercel-ip-longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Non-ASCII city names are percent-encoded per RFC3986.
  const city = requestHeaders.get("x-vercel-ip-city");
  const region = requestHeaders.get("x-vercel-ip-country-region");

  return {
    lat,
    lng,
    label: [safeDecode(city), region].filter(Boolean).join(", ") || "your area",
    source: "ip",
  };
}

function safeDecode(value: string | null): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
