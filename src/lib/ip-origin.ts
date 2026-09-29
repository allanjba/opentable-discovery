import { cookies, headers } from "next/headers";
import { ORIGIN_COOKIE, type Origin } from "@/lib/origin";

/**
 * The origin to render with, resolved before anything paints.
 *
 * A location the visitor chose wins over the IP guess, and both are available
 * on the server — which is what removes the flicker. Anything resolved after
 * hydration, however fast, means rendering once with the wrong answer.
 */
export async function resolveOrigin(): Promise<Origin | null> {
  return (await chosenOrigin()) ?? (await ipOrigin());
}

/** A previously chosen location, sent back to us as a cookie. */
async function chosenOrigin(): Promise<Origin | null> {
  const value = (await cookies()).get(ORIGIN_COOKIE)?.value;
  if (!value) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Origin;
    return onEarth(parsed?.lat, parsed?.lng) ? parsed : null;
  } catch {
    // Someone else's cookie, or a half-written one. Fall through to the IP.
    return null;
  }
}

/**
 * A rough origin from the request's IP.
 *
 * Vercel attaches these headers to every request; they are absent locally, so
 * a dev machine falls back to whatever the visitor has chosen. City-level
 * accuracy is enough — `aroundPrecision` buckets distances at 2 km, so a few
 * hundred metres of error changes no ordering.
 */
async function ipOrigin(): Promise<Origin | null> {
  const requestHeaders = await headers();

  // Parsed through a helper because Number(null) is 0, not NaN — a missing
  // header sailed through the finite check as a valid 0,0, which is in the
  // Gulf of Guinea. Locally, where these headers do not exist, every result
  // was "8,507 km away" and the nearest restaurants were the easternmost ones
  // in the dataset. It looked like a geo bug; it was a coercion bug.
  const lat = coordinate(requestHeaders.get("x-vercel-ip-latitude"));
  const lng = coordinate(requestHeaders.get("x-vercel-ip-longitude"));
  if (lat === null || lng === null) return null;

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

/** A coordinate, or null for anything that is not actually a number. */
function coordinate(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A finite check is not enough, and the failure is worse than it sounds.
 *
 * Probed in production with a cookie of lat 999 / lng 999: Number.isFinite says
 * true, so it was accepted and passed to Algolia as aroundLatLng. Algolia
 * rejects the parameter, every query in the tree fails, and because each
 * discovery row hides itself when it has no hits, the page renders with no
 * rows at all — not wrong results, an empty page.
 *
 * The cookie is the visitor's own, so this is self-inflicted rather than an
 * attack, but a value we write ourselves is still a value we should not trust
 * on the way back in.
 */
function onEarth(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}
