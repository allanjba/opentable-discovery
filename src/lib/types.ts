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
  /** Clean and formatted, unlike `phone`. */
  phone_number: string;
  /** "$30 and under" | "$31 to $50" | "$50 and over" */
  price_range: string;
  /** Casual Dining | Casual Elegant | Fine Dining | Home Style */
  dining_style: string;
};

/**
 * A merged record: the source JSON record, unchanged, plus the CSV fields.
 */
export type Restaurant = { objectID: number } & FromList & FromInfo;
