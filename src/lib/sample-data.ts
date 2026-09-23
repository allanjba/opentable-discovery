/**
 * Hardcoded sample data, used only to build and check the static layout before
 * any real data pipeline or search exists.
 *
 * These are real records lifted from data/source/, not invented, so the layout
 * is exercised against realistic field lengths — long neighbourhood names,
 * diacritics in restaurant names, four-digit review counts.
 *
 * Deleted once the search reads from the merged dataset.
 */

export type SampleRestaurant = {
  objectID: string;
  name: string;
  food_type: string;
  neighborhood: string;
  price_range: string;
  stars_count: number;
  reviews_count: number;
};

export const SAMPLE_RESTAURANTS: SampleRestaurant[] = [
  {
    objectID: "130",
    name: "Boulevard",
    food_type: "American",
    neighborhood: "Financial District / Embarcadero",
    price_range: "$31 to $50",
    stars_count: 4.6,
    reviews_count: 4934,
  },
  {
    objectID: "3411",
    name: "Sutro's at the Cliff House",
    food_type: "American",
    neighborhood: "Richmond District",
    price_range: "$50 and over",
    stars_count: 4.3,
    reviews_count: 4729,
  },
  {
    objectID: "17035",
    name: "Waterbar",
    food_type: "Seafood",
    neighborhood: "Financial District / Embarcadero",
    price_range: "$31 to $50",
    stars_count: 4.5,
    reviews_count: 4385,
  },
  {
    objectID: "2294",
    name: "Wallsé",
    food_type: "Modern European",
    neighborhood: "West Village",
    price_range: "$50 and over",
    stars_count: 4.5,
    reviews_count: 993,
  },
  {
    objectID: "95197",
    name: "Tía Pol",
    food_type: "Tapas / Small Plates",
    neighborhood: "Chelsea",
    price_range: "$30 and under",
    stars_count: 4.4,
    reviews_count: 233,
  },
  {
    objectID: "1959",
    name: "Pappas Bros. Steakhouse",
    food_type: "Steak",
    neighborhood: "NW Dallas / Love Field Area",
    price_range: "$50 and over",
    stars_count: 4.6,
    reviews_count: 3980,
  },
];

/**
 * Real facet counts from the full 5,000-record dataset. The current experience
 * shows seven cuisines with no overflow control — mirrored here so the layout
 * matches before we improve on it.
 */
export const SAMPLE_CUISINE_FACETS: { value: string; count: number }[] = [
  { value: "American", count: 865 },
  { value: "Italian", count: 850 },
  { value: "Contemporary American", count: 649 },
  { value: "Steakhouse", count: 328 },
  { value: "Seafood", count: 267 },
  { value: "French", count: 167 },
  { value: "Japanese", count: 140 },
];
