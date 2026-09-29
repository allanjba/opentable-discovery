"use client";

import { useCallback, useState } from "react";
import { ORIGIN_COOKIE, type Origin } from "@/lib/origin";

export type { Origin };
export { ORIGIN_COOKIE };

export type GeoStatus = "off" | "requesting" | "on" | "denied" | "unavailable";

/** Cities with real coverage in this dataset — see NOTES for the numbers. */
export const PRESETS: Omit<Origin, "source">[] = [
  { label: "New York", lat: 40.7128, lng: -74.006 },
  { label: "San Francisco", lat: 37.7749, lng: -122.4194 },
  { label: "Denver", lat: 39.7392, lng: -104.9903 },
  { label: "Miami", lat: 25.7617, lng: -80.1918 },
];

const ONE_YEAR = 60 * 60 * 24 * 365;

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

    const value =
      next && next.source !== "ip"
        ? `${encodeURIComponent(JSON.stringify(next))};max-age=${ONE_YEAR}`
        : ";max-age=0";

    // SameSite=Lax because this is only ever read on a top-level navigation,
    // and there is nothing sensitive in it — a rounded pair of coordinates the
    // visitor chose themselves.
    document.cookie = `${ORIGIN_COOKIE}=${value};path=/;SameSite=Lax`;
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
