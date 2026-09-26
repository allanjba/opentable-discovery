"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The user's search origin, when they have asked for one.
 *
 * Browser geolocation rather than Algolia's `aroundLatLngViaIP`, for a reason
 * specific to this app: `/` is server-rendered by InstantSearchNext, and
 * Algolia's docs are explicit that a server-side request geolocates to the
 * server unless you forward X-Forwarded-For. IP-based would silently centre
 * every search on our Vercel region instead of the user.
 *
 * `source` is kept because a preset and a real fix mean different things when
 * the results look wrong.
 */
export type Origin = {
  lat: number;
  lng: number;
  label: string;
  source: "browser" | "preset";
};

export type GeoStatus = "off" | "requesting" | "on" | "denied" | "unavailable";

/** Cities with real coverage in this dataset — see NOTES for the numbers. */
export const PRESETS: Omit<Origin, "source">[] = [
  { label: "New York", lat: 40.7128, lng: -74.006 },
  { label: "San Francisco", lat: 37.7749, lng: -122.4194 },
  { label: "Denver", lat: 39.7392, lng: -104.9903 },
  { label: "Miami", lat: 25.7617, lng: -80.1918 },
];

export function useGeolocation() {
  const [status, setStatus] = useState<GeoStatus>("off");
  const [origin, setOrigin] = useState<Origin | null>(null);

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
  }, []);

  const usePreset = useCallback((preset: Omit<Origin, "source">) => {
    setOrigin({ ...preset, source: "preset" });
    setStatus("on");
  }, []);

  /**
   * Asked for once on load, because distance is the default ordering rather
   * than something the user opts into.
   *
   * That is a change of position: geo started as opt-in because it is ranking
   * criterion #2 and can trample relevance. What makes default safe is
   * aroundPrecision — at 2 km buckets, restaurants in the same neighbourhood
   * tie on distance and fall through to relevance and popularity, so nearby
   * ordering is a tie-break rather than an override.
   *
   * It also answers a pain point from the brief directly: "restaurant chains
   * have multiple locations in the same city, making it hard for users to
   * identify the correct one." Nearest-first is the answer to that.
   *
   * A denial is not an error state. It falls back to the previous behaviour —
   * no distances, ranking untouched — and says nothing.
   */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    request();
  }, [request]);

  const clear = useCallback(() => {
    setOrigin(null);
    setStatus("off");
  }, []);

  return { status, origin, request, usePreset, clear };
}
