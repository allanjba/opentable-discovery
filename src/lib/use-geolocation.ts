"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The user's search origin, when they have asked for one.
 *
 * Three ways we might know it, in increasing order of precision:
 *
 *   ip       from the request headers, before the page renders — see ip-origin.ts
 *   preset   a city chosen in the demo panel
 *   browser  the Geolocation API, asked for explicitly
 *
 * Not Algolia's `aroundLatLngViaIP`: `/` is server-rendered, and Algolia's docs
 * are explicit that a server-side request geolocates to the *server* unless you
 * forward X-Forwarded-For. Reading Vercel's headers ourselves gets the same
 * answer without that trap, and lets us keep the value.
 *
 * `source` is kept because "we guessed from your IP" and "you told us" mean
 * different things when the results look wrong.
 */
export type Origin = {
  lat: number;
  lng: number;
  label: string;
  source: "browser" | "preset" | "ip";
};

export type GeoStatus = "off" | "requesting" | "on" | "denied" | "unavailable";

/** Cities with real coverage in this dataset — see NOTES for the numbers. */
export const PRESETS: Omit<Origin, "source">[] = [
  { label: "New York", lat: 40.7128, lng: -74.006 },
  { label: "San Francisco", lat: 37.7749, lng: -122.4194 },
  { label: "Denver", lat: 39.7392, lng: -104.9903 },
  { label: "Miami", lat: 25.7617, lng: -80.1918 },
];

/** Where an explicit choice is remembered between visits. */
const STORAGE_KEY = "opentable-discovery-origin";

export function useGeolocation(initialOrigin: Origin | null = null) {
  const [status, setStatus] = useState<GeoStatus>(initialOrigin ? "on" : "off");
  const [origin, setOriginState] = useState<Origin | null>(initialOrigin);

  /**
   * Explicit choices are remembered; the IP guess is not.
   *
   * Persisting the guess would be pointless — it is recomputed on every request
   * anyway — and worse, a stale stored guess would fight the fresh one. Only
   * something the visitor actually chose is worth keeping.
   */
  const setOrigin = useCallback((next: Origin | null) => {
    setOriginState(next);
    try {
      if (next && next.source !== "ip") {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Private browsing, blocked storage — persistence is a convenience, not
      // a requirement, and losing it should not break the search.
    }
  }, []);

  /**
   * A remembered choice overrides the IP guess, once, on mount.
   *
   * This cannot be read during the first render: the server has no localStorage
   * and the markup would not match. So it happens after hydration, and does
   * cause one swap — but only for someone who deliberately set a location, and
   * only to give them what they asked for. The common case, an IP origin from
   * the server, paints correctly the first time.
   */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Origin;
      if (Number.isFinite(parsed?.lat) && Number.isFinite(parsed?.lng)) {
        /* eslint-disable react-hooks/set-state-in-effect -- reading a
           browser-only value after mount is exactly what this has to be: the
           server has no localStorage, so doing it during render would make the
           markup disagree with the HTML and break hydration. It runs once. */
        setOriginState(parsed);
        setStatus("on");
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      // Unreadable or malformed — fall back to whatever the server gave us.
    }
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }

    setStatus("requesting");

    // A watchdog, because getCurrentPosition's own `timeout` does not cover the
    // permission prompt — Chrome does not start counting until the user
    // answers. Left alone, an ignored prompt pins the UI in "requesting"
    // forever and the panel's own button stays disabled. A late fix still
    // wins: the callbacks check `settled` rather than trusting the order.
    let settled = false;
    const watchdog = setTimeout(() => {
      if (settled) return;
      settled = true;
      setStatus("unavailable");
    }, 12_000);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        clearTimeout(watchdog);
        settled = true;
        setOrigin({
          lat: coords.latitude,
          lng: coords.longitude,
          label: "your location",
          source: "browser",
        });
        setStatus("on");
      },
      (error) => {
        clearTimeout(watchdog);
        if (settled) return;
        settled = true;
        // PERMISSION_DENIED is 1; everything else (timeout, position
        // unavailable) is reported as unavailable so the copy can differ —
        // "you said no" and "it didn't work" want different next steps.
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }, [setOrigin]);

  const usePreset = useCallback(
    (preset: Omit<Origin, "source">) => {
      setOrigin({ ...preset, source: "preset" });
      setStatus("on");
    },
    [setOrigin],
  );

  const clear = useCallback(() => {
    setOrigin(null);
    setStatus("off");
  }, [setOrigin]);

  return { status, origin, request, usePreset, clear };
}
