"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  useMemo,
  useRef,
} from "react";
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
 *
 * Before anything is typed the panel becomes a starting point rather than a
 * blank: the nearest few good restaurants, and whatever the visitor searched
 * last. The data for that was already arriving — an empty query against a
 * geo-sorted index IS "nearest and best" — so this is mostly a matter of
 * labelling it honestly and hiding the two sections that have nothing useful
 * to say yet.
 */

const SECTION_LIMIT = 5;

/**
 * Whether anything is typed yet, and whether we know where the user is.
 *
 * Passed by context rather than baked into the props, and that is the whole
 * trick. <Autocomplete> treats a new `indices` array or `panelComponent` as a
 * configuration change and re-registers its index widgets, which resets its own
 * input — the symptom is the box going blank mid-word while the headers react
 * correctly, which reads as nonsense until you notice the props are new objects
 * on every keystroke. Everything the widget receives is now referentially
 * stable, and the parts that depend on what is typed read it from here.
 */
/**
 * The widget sets aria-selected on the row the keyboard is on, so the active
 * row is styled off that rather than tracked in state.
 */
const INDEX_CLASS_NAMES = {
  item: "aria-selected:bg-grey-100",
};

/**
 * Hoisted out of the render, along with `classNames`, `onSelect` and `indices`.
 *
 * Every prop <Autocomplete> receives has to be referentially stable. An inline
 * object literal is a new object on each render; the widget reads that as a
 * configuration change and re-registers its index widgets, which throws away
 * what the user has typed. The symptom is the box going blank mid-word while
 * the section headers react correctly.
 */
const SHOW_RECENT = {
        storageKey: "opentable-discovery-recent",
        headerComponent: () => <SectionHeader>Recent searches</SectionHeader>,
        // The stock row draws a clock icon, and without instantsearch.css that
        // SVG has no intrinsic size — it filled the whole panel. Every other
        // row here is ours anyway, so this one is too.
        // The published type declares onRemoveRecentSearch on the component
        // *function object* rather than in its props, which cannot be what was
        // meant — the runtime passes it as a prop. Cast, with that noted,
        // rather than contort the component to satisfy a typo in a .d.ts.
        itemComponent: RecentRow as unknown as undefined,
        classNames: INDEX_CLASS_NAMES,
      };

const CLASS_NAMES = {
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
        };

/**
 * The prop type is an intersection, not a union: AutocompleteCommonProps
 * extends ComponentProps<'div'>, which already declares a DOM `onSelect`, so a
 * handler has to accept both shapes. Hence the narrowing inside.
 */
type SelectParams =
  | React.SyntheticEvent<HTMLDivElement>
  | {
      item: SuggestionItem;
      query: string;
      setQuery: (query: string) => void;
      url?: string;
    };

/**
 * What is currently typed, held outside React state on purpose.
 *
 * <Autocomplete> resets its own input whenever its parent re-renders. Holding
 * the typed value in useState therefore destroys it on the first keystroke:
 * the section headers switch correctly while the box goes blank, which reads
 * as nonsense until you check `input.value` and find the widget cleared it.
 *
 * So it lives in a tiny store instead. The input listener writes to it with no
 * setState, and only the two components that care — the Restaurants header and
 * the panel layout — subscribe. The component holding <Autocomplete> never
 * re-renders, so the widget never notices anything changed.
 */
function createTypedStore() {
  let value = "";
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set(next: string) {
      if (next === value) return;
      value = next;
      listeners.forEach((listen) => listen());
    },
    subscribe(listen: () => void) {
      listeners.add(listen);
      return () => {
        listeners.delete(listen);
      };
    },
  };
}

type TypedStore = ReturnType<typeof createTypedStore>;

const noop = () => () => {};
const emptyString = () => "";

const PanelState = createContext<{ store: TypedStore | null; located: boolean }>(
  { store: null, located: false },
);

/** True until the visitor has typed something. */
function useIsEmpty() {
  const { store } = useContext(PanelState);
  const typed = useSyncExternalStore(
    store?.subscribe ?? noop,
    store?.get ?? emptyString,
    emptyString,
  );

  return typed.trim().length === 0;
}


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
   * What is currently typed, as opposed to what has been submitted.
   *
   * InstantSearch only exposes the *committed* query, and this needs the live
   * one to know whether the panel is in its empty state. The widget owns the
   * input, so the value is read from the element itself rather than lifted —
   * a listener on the real input, attached through the ref that already exists
   * for closing the panel.
   */
  // Lazy useState rather than useRef: created once, stable identity forever,
  // and the setter is never called, so this never causes a render.
  const [store] = useState(createTypedStore);
  useEffect(() => {
    const container = root.current;
    if (!container) return;

    // Delegated from the container rather than bound to the input itself:
    // `input` events bubble, and binding directly broke silently when React
    // replaced the element — the listener stayed attached to a detached node
    // and the panel kept claiming the query was empty while the user typed.
    const onInput = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement) store.set(target.value);
    };

    container.addEventListener("input", onInput);
    return () => container.removeEventListener("input", onInput);
  }, [store]);

  /**
   * Close the panel after a selection.
   *
   * The input keeps focus when an item is chosen, and the panel stays open
   * while it does — sitting on top of the results the selection just produced.
   * Blurring is what closes it. Scoped through a ref rather than reaching for
   * document.activeElement, so it can only ever touch this widget's input.
   */
  const closePanel = useCallback(() => {
    root.current
      ?.querySelector<HTMLInputElement>("input.ais-AutocompleteInput")
      ?.blur();
  }, []);


  /**
   * Memoised, and it matters more than it looks.
   *
   * Building this array inline gave <Autocomplete> a new `indices` prop on
   * every render, so each keystroke tore down and re-registered the index
   * widgets — which reset the widget's own input state. The symptom was the
   * input going blank mid-word while the section headers reacted correctly,
   * which reads as nonsense until you notice the props are new objects.
   *
   * Only `origin` changes what these configs say; whether anything is typed is
   * read from context by the components that care.
   */
  const indices = useMemo(
    () => [
          {
            indexName: INDEX_NAME,
            headerComponent: RestaurantsHeader,
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
    ],
    [origin],
  );

  const onSelect = useCallback((params: SelectParams) => {
          // The prop type is a union: AutocompleteCommonProps extends
          // ComponentProps<'div'>, which already has a DOM onSelect, so this
          // has to narrow before use.
          if (!("item" in params)) return;
          // Supplying onSelect replaces the widget's own handler rather than
          // running alongside it — which is why it hands you setQuery. Omit
          // this call and choosing a suggestion silently does nothing.
          params.setQuery(queryFor(params.item));
          closePanel();
        }, [closePanel]);

  return (
    <PanelState.Provider
      value={useMemo(
        () => ({ store, located: origin !== null }),
        [store, origin],
      )}
    >
    <div ref={root}>
      <Autocomplete<SuggestionItem>
        placeholder="Search for Restaurants by Name, Cuisine, Location"
      /*
       * Recent searches are a widget feature, not something to hand-roll: the
       * widget already stores them in localStorage, dedupes them, and offers a
       * per-row remove. It records a term when one is submitted or a suggestion
       * is chosen, which is exactly when it should.
       */
        /*
       * The widget renders recent searches above everything else. On the empty
       * panel that is backwards for this product: someone who has just landed
       * is more likely to want a nearby suggestion than to re-run a term, and
       * "trending" is the thing that makes the blank state feel like a starting
       * point. Once they are typing, their own history is the better first
       * thing, so the default order comes back.
       *
       * Keys are matched rather than hardcoded, so this survives the widget
       * renaming or adding a section.
       */
      /*
       * Detached mode off, which is not a styling preference — it is
       * incompatible with server rendering.
       *
       * Below 680px the widget swaps the inline form for a full-screen search
       * button and overlay. The server cannot evaluate a media query, so it
       * always renders the form; the browser then renders the button, React
       * finds <form> where it expected <div role="button">, and hydration
       * fails. The whole search tree is discarded and rebuilt on the client —
       * on a page whose point is that names, counts and facets arrive in the
       * initial HTML.
       *
       * It also rendered a 295x295 magnifying glass, because the detached DOM
       * is a separate set of ten class names that instantsearch.css would
       * normally size and this project styles with Tailwind instead. Sizing
       * those would have fixed the icon and left the hydration failure.
       *
       * "none" is not a valid media query, so matchMedia never matches it. The
       * inline search bar is full-width and its panel already caps at 70vh with
       * its own scroll, so it works at phone widths as-is.
       */
      detachedMediaQuery="none"
      showRecent={SHOW_RECENT}
      classNames={CLASS_NAMES}
      onSelect={onSelect}
      panelComponent={PanelSections}
      indices={indices}
      />
    </div>
    </PanelState.Provider>
  );
}

/** "Trending near you" until something is typed, then just "Restaurants". */
function RestaurantsHeader() {
  const { located } = useContext(PanelState);
  const empty = useIsEmpty();

  return (
    <SectionHeader>
      {!empty ? "Restaurants" : located ? "Trending near you" : "Popular right now"}
    </SectionHeader>
  );
}

/**
 * Panel layout: which sections show, and in what order.
 *
 * With nothing typed, "the five biggest cities" and "the five biggest cuisines"
 * are not suggestions, they are noise — so Locations and Food Type only appear
 * once there is a query to match. Recent searches sit below trending on the
 * empty panel (someone who has just landed wants a nearby suggestion more than
 * a term they already tried) and above the results once typing starts, where
 * their own history is the better first thing.
 */
function PanelSections({
  elements,
}: {
  elements: Partial<Record<string, React.JSX.Element>>;
}) {
  const empty = useIsEmpty();

  const entries = Object.entries(elements);
  const isRecent = ([key]: [string, unknown]) => /recent/i.test(key);
  const isFacetSection = ([key]: [string, unknown]) =>
    /locations|cuisines/i.test(key);

  const visible = empty ? entries.filter((e) => !isFacetSection(e)) : entries;
  const ordered = empty
    ? [...visible.filter((e) => !isRecent(e)), ...visible.filter(isRecent)]
    : visible;

  return (
    <>
      {ordered.map(([key, element]) => (
        <Fragment key={key}>{element}</Fragment>
      ))}
    </>
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

/** A previously submitted term, with a way to forget it. */
function RecentRow({
  item,
  onSelect,
  onRemoveRecentSearch,
}: {
  item: { query: string };
  onSelect: () => void;
  onRemoveRecentSearch?: () => void;
}) {
  return (
    <div className="group flex w-full items-baseline gap-2 px-5 py-2 text-left hover:bg-grey-100">
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 cursor-pointer truncate text-left text-ink"
      >
        {item.query}
      </button>
      {onRemoveRecentSearch && (
        <button
          type="button"
          aria-label={`Forget "${item.query}"`}
          onClick={(event) => {
            event.stopPropagation();
            onRemoveRecentSearch();
          }}
          className="shrink-0 px-1 text-xs text-grey-400 opacity-0 hover:text-ink group-hover:opacity-100"
        >
          remove
        </button>
      )}
    </div>
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
