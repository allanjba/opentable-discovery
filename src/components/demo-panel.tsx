"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PRESETS, type GeoStatus, type Origin } from "@/lib/use-geolocation";

/**
 * Demo controls, deliberately kept out of the page.
 *
 * Two things live here, and they have the same shape: neither is something a
 * diner would ever use, and both would read as product claims if left on the
 * page. Overriding your location exists so the demo can be driven from a city
 * with coverage. The link to the old experience exists so the two can be shown
 * side by side. A prototype is read as a proposal, so anything that is only
 * there for our convenience belongs somewhere the audience will not mistake
 * for the product.
 *
 * So it lives behind a panel with no visible trigger:
 *
 *   Ctrl+Shift+D   toggle
 *   ?demo          open on load, for a bookmarkable demo link
 *   Esc            close
 *
 * Ctrl rather than Cmd on purpose: Cmd+Shift+D is bookmark-all-tabs in Chrome.
 */

const SHORTCUT_HINT = "Ctrl + Shift + D";

type Props = {
  status: GeoStatus;
  origin: Origin | null;
  onRequest: () => void;
  onPreset: (preset: (typeof PRESETS)[number]) => void;
  onClear: () => void;
};

export function DemoPanel({ status, origin, onRequest, onPreset, onClear }: Props) {
  // ?demo opens it on load without needing the shortcut — handy for a
  // bookmarked demo URL, and it keeps the trigger out of the markup. Read
  // through useSearchParams rather than window, so it is correct during the
  // server render too and needs no effect to set state.
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.has("demo"));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/30 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Demo controls"
        className="w-full max-w-md bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold text-ink">Demo controls</h2>
          <span className="text-xs text-grey-400">{SHORTCUT_HINT} · Esc</span>
        </div>

        <h3 className="mb-2 text-sm font-semibold text-ink">Search origin</h3>
        <p className="mb-3 text-xs text-grey-500">
          Results are sorted by distance from your location by default. Override
          it here — the dataset covers 51 US metros, and these four are the ones
          with real coverage.
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onPreset(preset)}
              className={`border px-2.5 py-1 text-sm ${
                origin?.label === preset.label
                  ? "border-brand bg-brand text-white"
                  : "border-grey-200 text-grey-700 hover:border-brand hover:text-brand"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-grey-200 pt-3 text-sm">
          <button
            type="button"
            onClick={onRequest}
            disabled={status === "requesting"}
            className="border border-grey-300 px-2.5 py-1 text-ink hover:bg-grey-100 disabled:opacity-50"
          >
            {status === "requesting" ? "Locating…" : "Use my real location"}
          </button>
          {origin && (
            <button
              type="button"
              onClick={onClear}
              className="text-brand underline hover:no-underline"
            >
              clear
            </button>
          )}
          <span className="ml-auto text-xs text-grey-500">
            {origin
              ? `${origin.label} (${origin.source})`
              : status === "denied"
                ? "permission denied"
                : status === "unavailable"
                  ? "location unavailable"
                  : "not set"}
          </span>
        </div>

        <div className="mt-4 border-t border-grey-200 pt-3">
          <h3 className="mb-1 text-sm font-semibold text-ink">Compare</h3>
          <p className="mb-2 text-xs text-grey-500">
            The control condition — the same data behind a substring search with
            no typo tolerance, no synonyms and no ranking.
          </p>
          <Link
            href="/old"
            className="text-sm text-brand underline hover:no-underline"
          >
            View the current experience →
          </Link>
        </div>
      </div>
    </div>
  );
}
