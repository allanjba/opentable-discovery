/** Fields from data/source/restaurants_list.json */
type FromList = {
  name: string;
  address: string;
  /** Metro grouping, e.g. "New York / Tri-State Area". 51 distinct values. */
  area: string;
  city: string;
  /** Always "US" in this dataset — no information content. */
  country: string;
  /** Currently 302-redirects to a generic placeholder; real photos are gone. */
  image_url: string;
  mobile_reserve_url: string;
  payment_options: string[];
  /** Dirty: trailing "x" on every value, inconsistent formatting. */
  phone: string;
  postal_code: string;
  /** Integer tier 2-4. Conflicts with price_range on ~220 records. */
  price: number;
  reserve_url: string;
  state: string;
  /** Already in the shape Algolia expects for geo-search. */
  _geoloc: { lat: number; lng: number };
};

/** Fields from data/source/restaurants_info.csv */
type FromInfo = {
  /** 114 distinct values with overlapping taxonomy (Steak vs Steakhouse). */
  food_type: string;
  /** 1.0 - 5.0 */
  stars_count: number;
  /** Heavily skewed: median 336, max 12,669. */
  reviews_count: number;
  neighborhood: string;
  /** Better formatted than `phone`, but extensions are truncated to " e". */
  phone_number: string;
  /** "$30 and under" | "$31 to $50" | "$50 and over" */
  price_range: string;
  /** Casual Dining | Casual Elegant | Fine Dining | Home Style */
  dining_style: string;
};

/**
 * The faithful join of the two source files, before any cleanup.
 * `objectID` stays the integer the source has it as.
 */
export type MergedRestaurant = { objectID: number } & FromList & FromInfo;

/**
 * A phone number, stored canonically as digits. Formatting is a display
 * concern. Every number in this dataset is a bare 10-digit NANP number — there
 * are no country codes, so none is stored.
 */
export type Phone = {
  /** 10 digits, no punctuation. */
  number: string;
  /** Digits only, absent when the source had no extension. */
  ext?: string;
};

/**
 * What actually gets indexed.
 *
 * The two source phone fields disagree on 95 records and neither is reliably
 * better, so both are merged into `phones` and the originals are dropped —
 * they were searchable noise besides.
 */
export type Restaurant = Omit<MergedRestaurant, "phone" | "phone_number"> & {
  phones: Phone[];
  /**
   * `food_type` split on its separators. Eight source values are compound
   * ("Mexican / Southwestern", "Global, International"), which made them their
   * own orphan facet value — a restaurant tagged "Mexican / Southwestern" was
   * findable under neither Mexican nor Southwestern. Facet on this, not on
   * `food_type`.
   */
  cuisines: string[];
  /**
   * A Bayesian average of `stars_count` and `reviews_count`, the attribute
   * `customRanking` sorts on. Derived because Algolia ranks on stored values
   * and has no query-time scoring function — see `scripts/clean.mts`.
   */
  popularity_score: number;
};

/**
 * Which field a location label came from. Used only as the subtitle in the
 * autocomplete, so "Portland" the city reads differently from "SE Portland"
 * the neighbourhood.
 */
export type LocationKind = "area" | "city" | "neighborhood";

/**
 * A row in the derived `locations` index.
 *
 * The autocomplete renders hits, so a location has to be a record somewhere —
 * facet values cannot carry a kind, a display label or their own ranking.
 */
export type LocationSuggestion = {
  objectID: string;
  label: string;
  kind: LocationKind;
  /** Restaurants matching this label in ANY of the three location fields. */
  restaurant_count: number;
};

/** A row in the derived `cuisines` index. */
export type CuisineSuggestion = {
  objectID: string;
  label: string;
  restaurant_count: number;
};
