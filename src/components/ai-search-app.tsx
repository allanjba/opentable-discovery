"use client";

// Only the chat component's stylesheet, not the whole of instantsearch.css.
// The file is component-scoped, so it styles the chat widget and leaves every
// other widget on the page to Tailwind — which is the arrangement the rest of
// this project relies on.
import "instantsearch.css/components/chat.css";

import { useMemo, useRef } from "react";
import type { ChatHandle } from "react-instantsearch";
import {
  Chat,
  Configure,
  RefinementList,
  useInstantSearch,
  useStats,
} from "react-instantsearch";
import { InstantSearchNext } from "react-instantsearch-nextjs";
import type { RefinementListProps } from "react-instantsearch";
import { INDEX_NAME, searchClient } from "@/lib/algolia";
import { priceSymbols } from "@/components/restaurant-hit";
import { InfiniteResults } from "@/components/infinite-results";
import { SearchAutocomplete } from "@/components/autocomplete";
import { SortedByDistance } from "@/components/near-me";
import { DemoPanel } from "@/components/demo-panel";
import { DiscoveryHome } from "@/components/discovery-home";
import type { Discovery } from "@/lib/discovery";
import { useGeolocation, type Origin } from "@/lib/use-geolocation";

/**
 * A copy of the submitted search experience with Algolia's Agent Studio chat
 * added, served at /ai.
 *
 * Deliberately a copy rather than a flag on the original: `/` is the page that
 * was submitted and graded, and it should keep behaving exactly as it did. The
 * duplication is the point — this is an addition made after the fact, not a
 * revision of the work under review.
 *
 * The original description follows.
 *
 * The search experience, built on React InstantSearch.
 *
 * This replaced a hand-rolled query layer. The hand-rolled version worked and
 * is worth having written — it is how we learned that multi-facet sidebars need
 * disjunctive faceting, and that it fails silently on the *second* click. But
 * `RefinementList` does that on its own, so the batching logic is gone rather
 * than maintained, along with the paging, the stale-response guards and the
 * pinning of selected facet values.
 *
 * Algolia's own guidance is to use the library; hand-rolling it was the thing
 * to do once, to understand what the library is doing.
 */

/**
 * One page size everywhere.
 *
 * Browsing used to show three, mirroring the mockup's empty state. Infinite
 * scroll makes that unreachable: the sentinel is on screen at first paint, so a
 * second page loads before anyone sees three. Keeping it only meant loading
 * three at a time — five round trips for fifteen results.
 */
const PAGE_SIZE = 10;

/**
 * The agent, built in Algolia's Agent Studio dashboard.
 *
 * Not a secret: it is an identifier, and it ships in the client bundle exactly
 * like the search-only API key does.
 */
const AGENT_ID = "6a9c27d1-78ae-4bce-9314-508279ae3927";

/**
 * One restaurant as the agent returns it.
 *
 * Deliberately defensive rather than reusing RestaurantCard: the agent decides
 * which attributes come back, and a card that calls `stars_count.toFixed(1)` on
 * a record that lacks it takes the whole panel down. Every field here is
 * optional and every one is checked.
 */
function AgentHit({ item }: { item: Record<string, unknown> }) {
  const text = (key: string) =>
    typeof item[key] === "string" ? (item[key] as string) : undefined;

  const name = text("name") ?? "Restaurant";
  const image = text("image_url");

  // Vertical, because these render in a narrow carousel cell inside the chat
  // panel — the first version put the image beside the text and everything
  // truncated to "Italian | Mi...".
  return (
    // Horizontal padding rather than a margin: the carousel positions the
    // cells, and a margin would fight that. This just insets the content so
    // adjacent images stop touching.
    <article className="w-full min-w-0 px-2">
      {image && (
        /* eslint-disable-next-line @next/next/no-img-element -- the agent can
           return any host; next/image would need each one allowlisted. */
        <img
          src={image}
          alt={name}
          className="mb-1.5 aspect-[3/2] w-full bg-grey-100 object-cover"
        />
      )}
      <h3 className="truncate text-sm font-semibold text-ink" title={name}>
        {name}
      </h3>
      <p className="truncate text-xs text-grey-500">
        {[text("food_type"), text("neighborhood")].filter(Boolean).join(" · ")}
      </p>
    </article>
  );
}

export function AiSearchApp({
  initialOrigin,
  discovery,
}: {
  initialOrigin: Origin | null;
  discovery: Discovery;
}) {
  const geo = useGeolocation(initialOrigin);

  // The chat is opened from our own button in the search bar rather than the
  // stock floating trigger, so the handle has to be reachable from there.
  const chat = useRef<ChatHandle>(null);

  /**
   * What the panel shows before anything is typed.
   *
   * An empty box asks the user to invent a question, and most people type
   * something the keyword search would have handled anyway. These three are
   * chosen because each one is a thing the index genuinely cannot do:
   * attributes the catalogue does not record, an open-ended intent with no
   * keyword equivalent, and a request that only works if the location context
   * is actually arriving.
   *
   * Memoised so the component identity is stable — a new function each render
   * would remount the panel body on every keystroke elsewhere on the page.
   */
  const ChatEmptyState = useMemo(() => {
    const city = geo.origin?.label;

    const starters = [
      city
        ? `Romantic Italian with outdoor seating in ${city}`
        : "Romantic Italian with outdoor seating",
      "Where should I take a client for dinner?",
      "Somewhere cheap and good near me",
    ];

    return function ChatEmpty() {
      return (
        <div className="px-4 py-6">
          <p className="font-semibold text-ink">
            {city ? `Looking for somewhere in ${city}?` : "What are you in the mood for?"}
          </p>
          <p className="mt-1 text-sm text-grey-500">
            Ask in your own words — including the things the filters cannot
            describe.
          </p>

          <ul className="mt-4 space-y-2">
            {starters.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => chat.current?.sendMessage({ text })}
                  className="w-full cursor-pointer px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-grey-100"
                >
                  {text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    };
  }, [geo.origin]);

  return (
    <InstantSearchNext
      indexName={INDEX_NAME}
      searchClient={searchClient}
      // `future` opts into the v8 behaviour now so the upgrade is not a
      // breaking change later; both flags are the v8 defaults.
      future={{
        preserveSharedStateOnUnmount: true,
        persistHierarchicalRootCount: true,
      }}
    >
      <DemoPanel
        status={geo.status}
        origin={geo.origin}
        onRequest={geo.request}
        onPreset={geo.usePreset}
        onClear={geo.clear}
      />

      <Configure hitsPerPage={PAGE_SIZE} />

      {/*
        `context` is Agent Studio's channel for ambient session facts: it rides
        along with the user's turn as metadata, never appears as a chat bubble,
        and is validated server-side as a flat Record<string, string>.

        The function form matters — the origin changes when a city is picked in
        the demo panel, and this is invoked once per send, so each message
        carries the location that was true when it was sent.

        `nearby_inventory` is the honest one. Without it, someone in a city this
        catalogue does not cover asks "what's good near me" and the agent
        confidently answers with restaurants 200 km away. It is the same rule
        the row headings follow: only claim local when there is something local.
      */}
      <Chat
        ref={chat}
        agentId={AGENT_ID}
        feedback
        itemComponent={AgentHit}
        emptyComponent={ChatEmptyState}
        // Our search-bar button is the trigger; without this the widget insists
        // on a <ChatTrigger> or AI mode being present.
        disableTriggerValidation
        context={(): Record<string, string> => {
          // Annotated, because a ternary here widens to a union whose empty
          // branch has optional-undefined keys, which does not satisfy
          // Record<string, string>.
          const language = document.documentElement.lang || "en";

          const origin = geo.origin;
          if (!origin) return { interface_language: language };

          return {
            city: origin.label,
            latitude: String(origin.lat),
            longitude: String(origin.lng),
            location_source: origin.source,
            nearby_inventory: discovery.nearby ? "yes" : "none",
            // A deterministic fallback for the reply language. The agent should
            // mirror whatever language the user writes in, but a two-word
            // message is often too short to infer from — and guessing wrong is
            // very visible in a demo. Read from the document rather than
            // hardcoded, so it stays true if the page is ever localised.
            interface_language: language,
          };
        }}
      />

      {/*
        Geo parameters only exist while the user has asked for distance search.
        Rendering <Configure> conditionally is how a search parameter is turned
        off in InstantSearch — omitting it restores the previous behaviour
        exactly, which matters because Geo is ranking criterion #2 and would
        otherwise outrank everything the user actually typed.

        aroundRadius "all" sorts by distance without filtering. A fixed radius
        would return zero results from anywhere the dataset does not cover.

        aroundPrecision groups distances into 2 km buckets, so restaurants in
        the same neighbourhood tie on Geo and fall through to relevance and
        popularity. At the 10 m default, distance alone would order everything
        and popularity_score would never get a say.
      */}
      {geo.status === "on" && geo.origin && (
        <Configure
          aroundLatLng={`${geo.origin.lat},${geo.origin.lng}`}
          aroundRadius="all"
          aroundPrecision={2000}
          getRankingInfo
        />
      )}

      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        {/*
          Sticky rather than an inner scroll container. Letting the page scroll
          and pinning the chrome keeps one scrollbar, keeps the
          IntersectionObserver on its default viewport root, and avoids the
          nested-scroll behaviour that goes wrong on touch devices.
        */}
        <div className="sticky top-0 z-50 bg-brand-dark p-6 shadow-md">
          {/*
            The arbitrary variants are scoped to this wrapper on purpose. The
            autocomplete's own class names live in a component shared with `/`,
            which is the submitted page — so the room for this button is made
            here, where only /ai is affected.
          */}
          <div className="relative [&_.ais-AutocompleteInput]:pr-32 [&_.ais-AutocompleteResetButton]:right-24">
            <SearchAutocomplete origin={geo.origin} />
            <AskAiButton chatRef={chat} />
          </div>
        </div>

        <div className="flex flex-col bg-surface shadow-md sm:flex-row">
          {/*
            Two elements, because the divider and the sticking want opposite
            things from the same box.

            A flex child stretches to the row height by default, which is what
            draws the border all the way down — but a full-height element has
            nothing to stick to, so putting `sticky` on it does nothing. Giving
            it `self-start` fixes the sticking and collapses the box to the
            height of the facets, leaving the border stopping partway down the
            page.

            So the wrapper stays stretched and owns the border, and the sticky
            aside sits inside it. The aside now sticks within a container that
            runs the full height of the results, which is also the correct place
            for it to stop.
          */}
          <div className="w-full sm:w-64 sm:shrink-0 sm:border-r sm:border-grey-200">
            <aside className="p-6 sm:sticky sm:top-[6.5rem] sm:max-h-[calc(100vh-6.5rem)] sm:overflow-y-auto">
              <Facet attribute="cuisines" label="Cuisine/Food Type" limit={7} />
              <Facet attribute="dining_style" label="Dining Style" limit={10} />
              <Facet
                attribute="price"
                label="Price"
                limit={10}
                // Price tiers are 2, 3 and 4 — order by the tier, not by
                // popularity, and render them the way their own filter does.
                sortBy={["name:asc"]}
                transformItems={(items) =>
                  items.map((item) => ({
                    ...item,
                    label: priceSymbols(item.value),
                  }))
                }
              />
            </aside>
          </div>

          <section className="min-w-0 flex-1 p-6">
            <ResultsArea origin={geo.origin} discovery={discovery} />
          </section>
        </div>
      </div>
    </InstantSearchNext>
  );
}

/**
 * Chooses between the discovery landing and the results list.
 *
 * "Browsing" means no query *and* no active facet — both have to be checked.
 * Query alone was the first version and it was wrong: picking a cuisine with an
 * empty search box left the landing on screen, silently ignoring the filter the
 * user had just set.
 *
 * The stats line belongs to the results view only. "5,000 results found" above a
 * curated landing page describes a list nobody asked for.
 */
function ResultsArea({
  origin,
  discovery,
}: {
  origin: Origin | null;
  discovery: Discovery;
}) {
  const { indexUiState } = useInstantSearch();

  const refinements = Object.values(indexUiState.refinementList ?? {});
  const browsing =
    !indexUiState.query && !refinements.some((values) => values.length > 0);

  if (browsing) {
    return <DiscoveryHome origin={origin} discovery={discovery} />;
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-baseline gap-2 border-b border-grey-200 pb-3">
        <ResultStats />
        <SortedByDistance origin={origin} />
      </div>

      <InfiniteResults origin={origin} discovery={discovery} />
    </>
  );
}

/**
 * Opens the agent from inside the search bar, carrying whatever was searched.
 *
 * This is the point of the page. The keyword index cannot serve "romantic
 * italian with outdoor seating" — measured on this data, "outdoor seating"
 * returns 0 and "romantic italian" silently discards "romantic" and returns 874
 * Italian restaurants. Handing the same words to the agent from the same box
 * makes that gap the demo rather than a footnote.
 *
 * It seeds the prompt rather than sending it, so the handoff is visible and the
 * text can still be edited. Swap setInput for sendMessage to fire immediately.
 */
function AskAiButton({
  chatRef,
}: {
  chatRef: React.RefObject<ChatHandle | null>;
}) {
  const { indexUiState } = useInstantSearch();
  const query = indexUiState.query ?? "";

  return (
    <button
      type="button"
      onClick={() => {
        chatRef.current?.setOpen(true);
        if (query) chatRef.current?.setInput(query);
      }}
      /*
        A gradient rather than a flat fill, because that is the visual language
        people now read as "this is the AI one" — and brightness, not a second
        gradient, on hover: background-image does not transition, so swapping
        the stops would snap rather than ease.
      */
      className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 cursor-pointer items-center gap-1.5 bg-[linear-gradient(115deg,var(--brand-dark)_0%,var(--brand)_55%,var(--ai-glow)_100%)] px-3 py-2 text-sm font-semibold text-white shadow-sm transition duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white"
      aria-label={query ? `Ask AI about "${query}"` : "Ask AI"}
    >
      <Sparkle />
      Ask AI
    </button>
  );
}

/** Sized explicitly — an unsized SVG is how the mobile autocomplete broke. */
function Sparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.6L19.5 9.5 13.9 11.4 12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z" />
      <path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" />
    </svg>
  );
}

type FacetProps = {
  label: string;
} & Pick<
  RefinementListProps,
  "attribute" | "limit" | "sortBy" | "transformItems"
>;

/**
 * One facet group in the sidebar.
 *
 * `RefinementList` defaults to sortBy ['isRefined', 'count:desc', 'name:asc'],
 * which keeps a selected value visible even when it falls outside the top N.
 * We had to build that by hand before; it is the library's default.
 */
function Facet({ label, ...props }: FacetProps) {
  return (
    <div className="mb-7 last:mb-0">
      <h2 className="mb-3 font-semibold text-ink">{label}</h2>
      <RefinementList
        {...props}
        classNames={{
          list: "space-y-0",
          item: "",
          label:
            "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-[15px] text-ink hover:bg-grey-100",
          // hover:bg-grey-100 on the label would otherwise win over the
          // selected background, so a selected row turns grey under the cursor
          // and reads as if it is being deselected.
          selectedItem:
            "[&_label]:bg-brand [&_label]:hover:bg-brand [&_label]:text-white [&_.ais-RefinementList-count]:text-white",
          checkbox: "sr-only",
          labelText: "truncate",
          count: "shrink-0 text-grey-400",
        }}
      />
    </div>
  );
}

/**
 * The result count and server-side timing.
 *
 * `<Stats>` renders a single string, and this needs two differently styled
 * halves, so it uses the headless hook. Every widget has one — the hook is the
 * escape hatch when the markup matters more than the default.
 *
 * processingTimeMS is Algolia's own server time, not a stopwatch around fetch,
 * so it no longer includes our network latency the way the hand-rolled version
 * did.
 */
function ResultStats() {
  const { nbHits, processingTimeMS } = useStats();

  return (
    <>
      <span className="font-semibold text-ink">
        {nbHits.toLocaleString()} {nbHits === 1 ? "result" : "results"} found
      </span>
      <span className="text-sm text-grey-500">
        in {(processingTimeMS / 1000).toFixed(3)} seconds
      </span>
    </>
  );
}
