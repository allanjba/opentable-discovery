"use client";

import { useRef } from "react";
import { Autocomplete, Highlight } from "react-instantsearch";
import type { Hit } from "instantsearch.js";
import type {
  CuisineSuggestion,
  LocationSuggestion,
  Restaurant,
} from "@/lib/types";
import { INDEX_NAME } from "@/lib/algolia";
import type { Origin } from "@/lib/use-geolocation";

/**
 * The grouped autocomplete, modelled on OpenTable's own.
 *
 * Three sections from three indices, because <Autocomplete> renders hits and
 * takes one config per index. Restaurants come from the main index restricted
 * to the name attribute; locations and cuisines come from the derived indices
 * built by `npm run data:suggest`.
 *
 * Why sections rather than one ranked list: "Lafayette" is both a restaurant
 * and a city, and one ordered list forces one of those to lose. Splitting them
 * moves the disambiguation to the point of selection, where the user knows
 * which they meant, and dissolves a problem no amount of ranking could fix.
 *
 * Selecting a suggestion puts its text in the search box and runs an ordinary
 * search — it does not apply a filter. Filtering stays in the sidebar. That
 * works because every suggestion is text the main index already searches well:
 * "SE Portland" returns its 20, "Small Plates" its 42.
 *
 * The Restaurants section is distance-aware. Each index in <Autocomplete> has
 * its own searchParameters and does NOT inherit the page's <Configure>, so the
 * geo parameters are passed in explicitly — which is the better arrangement
 * anyway, since the dropdown wants its own tuning. Typing "steak" in Denver
 * should offer Denver steakhouses before San Francisco ones.
 *
 * Locations and Food Type stay un-geocoded: those rows are labels, not places,
 * and their records carry no _geoloc to rank on.
 */

const SECTION_LIMIT = 5;

/**
 * The widget sets aria-selected on the row the keyboard is on, so the active
 * row is styled off that rather than tracked in state.
 */
const INDEX_CLASS_NAMES = {
  item: "aria-selected:bg-grey-100",
};

/**
 * <Autocomplete> is generic over ONE item type for every index, so the three
 * shapes become a union and each row narrows it. `kind` and `name` are the
 * discriminators — only a location has `kind`, only a restaurant has `name`.
 */
type SuggestionItem =
  Hit<Restaurant> | Hit<LocationSuggestion> | Hit<CuisineSuggestion>;

const isLocation = (item: SuggestionItem): item is Hit<LocationSuggestion> =>
  "kind" in item;
const isRestaurant = (item: SuggestionItem): item is Hit<Restaurant> =>
  "name" in item;

/** The text a suggestion puts in the search box when chosen. */
function queryFor(item: SuggestionItem): string {
  if (isRestaurant(item)) return item.name;
  return "label" in item ? item.label : "";
}

export function SearchAutocomplete({ origin }: { origin: Origin | null }) {
  const root = useRef<HTMLDivElement>(null);

  /**
   * Close the panel after a selection.
   *
   * The input keeps focus when an item is chosen, and the panel stays open
   * while it does — sitting on top of the results the selection just produced.
   * Blurring is what closes it. Scoped through a ref rather than reaching for
   * document.activeElement, so it can only ever touch this widget's input.
   */
  function closePanel() {
    root.current
      ?.querySelector<HTMLInputElement>("input.ais-AutocompleteInput")
      ?.blur();
  }

  return (
    <div ref={root}>
      <Autocomplete<SuggestionItem>
        onSelect={(params) => {
          // The prop type is a union: AutocompleteCommonProps extends
          // ComponentProps<'div'>, which already has a DOM onSelect, so this
          // has to narrow before use.
          if (!("item" in params)) return;
          // Supplying onSelect replaces the widget's own handler rather than
          // running alongside it — which is why it hands you setQuery. Omit
          // this call and choosing a suggestion silently does nothing.
          params.setQuery(queryFor(params.item));
          closePanel();
        }}
        placeholder="Search for Restaurants by Name, Cuisine, Location"
        classNames={{
          root: "relative",
          form: "relative",
          input:
            "w-full bg-surface px-5 py-3 text-lg text-ink outline-none placeholder:text-grey-400 focus:ring-2 focus:ring-brand",
          inputWrapper: "relative",
          submitButton: "hidden",
          loadingIndicator: "hidden",
          resetButton:
            "absolute right-4 top-1/2 -translate-y-1/2 text-grey-400 hover:text-ink",
          // The widget marks the panel aria-hidden when it closes but leaves
          // the hiding to instantsearch.css, which we do not load — every
          // widget here is styled with Tailwind instead. Driving `hidden` off
          // the ARIA state keeps the two in step rather than tracking open-ness
          // separately.
          panel:
            "absolute left-0 right-0 top-full z-50 max-h-[70vh] overflow-y-auto bg-surface shadow-lg aria-hidden:hidden",
        }}
        indices={[
          {
            indexName: INDEX_NAME,
            headerComponent: () => <SectionHeader>Restaurants</SectionHeader>,
            itemComponent: RestaurantRow,
            getQuery: queryFor,
            searchParameters: {
              hitsPerPage: SECTION_LIMIT,
              // The dropdown's Restaurants section is about names. Without this
              // it would repeat whatever the Locations section already says.
              restrictSearchableAttributes: ["name"],
              attributesToRetrieve: ["name", "neighborhood", "city"],
              // Same shape as the main results: sort by distance without
              // filtering, in 2 km buckets so that nearby matches tie and fall
              // through to name relevance rather than being ordered by metres.
              ...(origin
                ? {
                    aroundLatLng: `${origin.lat},${origin.lng}`,
                    aroundRadius: "all" as const,
                    aroundPrecision: 2000,
                  }
                : {}),
            },
            classNames: INDEX_CLASS_NAMES,
          },
          {
            indexName: "locations",
            headerComponent: () => <SectionHeader>Locations</SectionHeader>,
            itemComponent: LocationRow,
            getQuery: queryFor,
            searchParameters: { hitsPerPage: SECTION_LIMIT },
            classNames: INDEX_CLASS_NAMES,
          },
          {
            indexName: "cuisines",
            headerComponent: () => <SectionHeader>Food Type</SectionHeader>,
            itemComponent: CuisineRow,
            getQuery: queryFor,
            searchParameters: { hitsPerPage: SECTION_LIMIT },
            classNames: INDEX_CLASS_NAMES,
          },
        ]}
      />
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-grey-200 px-5 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-grey-500">
      {children}
    </div>
  );
}

/**
 * Shared row chrome, and the click handler.
 *
 * `onSelect` has to be wired by the item component — the widget passes it in
 * but does not attach it. Without this the row highlights on hover and does
 * nothing on click, which is exactly how it failed the first time.
 *
 * Each row also guards its own shape before rendering. The widget only ever
 * feeds a row from its own index, so the guard is unreachable in practice; it
 * is there to narrow the union, because ItemComponent takes one type for all
 * three indices and must return an Element rather than null.
 */
function Row({
  onSelect,
  children,
}: {
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className="flex w-full cursor-pointer items-baseline gap-2 px-5 py-2 text-left hover:bg-grey-100"
    >
      {children}
    </div>
  );
}

type RowProps = { item: SuggestionItem; onSelect: () => void };

const HIGHLIGHT = { highlighted: "bg-transparent font-semibold text-brand" };

function RestaurantRow({ item, onSelect }: RowProps) {
  if (!isRestaurant(item)) return <></>;
  return (
    <Row onSelect={onSelect}>
      <span className="min-w-0 truncate text-ink">
        <Highlight hit={item} attribute="name" classNames={HIGHLIGHT} />
      </span>
      <span className="ml-auto shrink-0 text-xs text-grey-500">
        {item.neighborhood}, {item.city}
      </span>
    </Row>
  );
}

/** "City" / "Neighborhood" / "Area" — so Portland reads apart from SE Portland. */
const KIND_LABEL: Record<LocationSuggestion["kind"], string> = {
  area: "Area",
  city: "City",
  neighborhood: "Neighborhood",
};

function LocationRow({ item, onSelect }: RowProps) {
  if (!isLocation(item)) return <></>;
  return (
    <Row onSelect={onSelect}>
      <span className="min-w-0 truncate text-ink">
        <Highlight hit={item} attribute="label" classNames={HIGHLIGHT} />
      </span>
      <span className="shrink-0 text-xs text-grey-400">
        {KIND_LABEL[item.kind]}
      </span>
      <span className="ml-auto shrink-0 text-xs text-grey-500">
        {item.restaurant_count.toLocaleString()}
      </span>
    </Row>
  );
}

function CuisineRow({ item, onSelect }: RowProps) {
  if (!("label" in item)) return <></>;
  return (
    <Row onSelect={onSelect}>
      <span className="min-w-0 truncate text-ink">
        <Highlight hit={item} attribute="label" classNames={HIGHLIGHT} />
      </span>
      <span className="ml-auto shrink-0 text-xs text-grey-500">
        {item.restaurant_count.toLocaleString()}
      </span>
    </Row>
  );
}
