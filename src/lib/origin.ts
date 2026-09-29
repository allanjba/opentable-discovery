/**
 * The search origin, shared by server and client.
 *
 * Deliberately in its own module with no "use client" and no next/headers
 * import: the server needs the cookie name to read it, the browser needs it to
 * write it, and neither should have to pull in the other's dependencies.
 */

/**
 * Where a location came from, in increasing order of precision:
 *
 *   ip       the request headers, resolved before the page renders
 *   preset   a city chosen in the demo panel
 *   browser  the Geolocation API, asked for explicitly
 *
 * Kept because "we guessed from your IP" and "you told us" mean different
 * things when the results look wrong.
 */
export type Origin = {
  lat: number;
  lng: number;
  label: string;
  source: "browser" | "preset" | "ip";
};

/**
 * A cookie rather than localStorage, and that is the whole point: localStorage
 * is invisible to the server, so a remembered location could only be applied
 * after hydration — every visit rendered once without it and then swapped. A
 * cookie travels with the request.
 */
export const ORIGIN_COOKIE = "otd_origin";
