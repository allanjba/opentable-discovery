/**
 * Cleanup transforms, applied as the last step of the build before the JSON is
 * written. Kept separate from the merge so that the join stays a faithful
 * superset of the source and every change to the data is visible here.
 *
 * Add new transforms as their own function and call them from `clean()`.
 */

import type { MergedRestaurant, Phone, Restaurant } from "../src/lib/types.ts";

/**
 * Splits a raw phone value into its number and extension.
 *
 * Both source fields carry extensions, in different formats:
 *
 *   json  "7078753513x27"      digits after the x
 *   json  "2123522300x"        trailing x on nearly every value, no extension
 *   csv   "(707) 875-3513 e"   extension truncated upstream to a bare letter
 *   csv   "(212) 352-2300"     no extension
 *
 * Taking the digits and splitting at ten handles all four, because every base
 * number in this dataset is exactly ten digits — verified across all 10,000
 * values. A letters-only extension leaves no digits behind, so it is dropped
 * without needing a special case.
 */
function parsePhone(value: string): Phone | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;

  const ext = digits.slice(10);
  return ext ? { number: digits.slice(0, 10), ext } : { number: digits.slice(0, 10) };
}

/**
 * Merges the two phone fields into one list.
 *
 * They disagree on 95 of 5,000 records. Some are single-digit transcription
 * differences, others are entirely different area codes — a switchboard versus
 * a reservations line, or a number that changed in one file and not the other.
 * Nothing in the data says which is current, so rather than silently picking a
 * winner we keep both and let the UI show both. In a real engagement this is a
 * question for the customer's data owner.
 */
export function mergePhones(record: MergedRestaurant): Phone[] {
  const fromList = parsePhone(record.phone);
  const fromInfo = parsePhone(record.phone_number);
  const phones: Phone[] = [];

  for (const phone of [fromList, fromInfo]) {
    if (!phone) continue;

    const existing = phones.find((other) => other.number === phone.number);
    if (!existing) {
      phones.push(phone);
      continue;
    }
    // Same number from both sources — keep whichever extension survived.
    if (!existing.ext && phone.ext) existing.ext = phone.ext;
  }

  return phones;
}

/** Applies every cleanup transform. */
export function clean(records: MergedRestaurant[]): Restaurant[] {
  // Computed once over the whole corpus, not per record.
  const priorRating = reviewWeightedMeanRating(records);

  return records.map((record) => {
    const { phone, phone_number, ...rest } = record;
    void phone;
    void phone_number;

    return {
      ...rest,
      phones: mergePhones(record),
      cuisines: splitCuisines(record.food_type),
      popularity_score: popularityScore(record, priorRating),
    };
  });
}

/**
 * Splits `food_type` into individual cuisine values.
 *
 * Eight of the 114 source values pack several concepts into one string:
 *
 *   "Mexican / Southwestern"          "Global, International"
 *   "Creole / Cajun / Southern"       "Tapas / Small Plates"
 *   "Contemporary French / American"  "Bar / Lounge / Bottle Service"
 *   "Latin / Spanish"                 "Fusion / Eclectic"
 *
 * As single strings they become their own orphan facet value, so a restaurant
 * tagged "Mexican / Southwestern" appears under neither Mexican nor
 * Southwestern. Four concepts — Southwestern, Small Plates, Global and Latin —
 * have no facet presence at all despite appearing in the data.
 *
 * Splitting on the separators is mechanical: no taxonomy judgement, nothing to
 * maintain as the catalogue grows. Grouping the remaining values into a
 * hierarchy was tried and rejected — it is not derivable from the strings
 * without semantic judgement, and the long tail is a display concern rather
 * than a data one.
 */
export function splitCuisines(foodType: string): string[] {
  const parts = foodType
    .split(/\s*[/,]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return [...new Set(parts)];
}

/**
 * How many reviews a restaurant needs before its own average is trusted as much
 * as the corpus average — the `m` of the Bayesian average below.
 *
 * 140 is the 25th percentile of review counts. Unlike the corpus mean, this is
 * a policy choice rather than a fact about the data, so it stays a constant with
 * a reason instead of being derived. 55 (p10) and 336 (the median) were also
 * measured: all three demote the one-review outliers, and 140 is where the top
 * of the list stops being dominated by thin 5.0s without burying genuinely
 * excellent small restaurants.
 */
const PRIOR_REVIEWS = 140;

/**
 * Scores are rounded to this many decimals. Four leaves 2,720 distinct values
 * across 5,000 records — a tie at that resolution is a real tie — and keeps
 * ~95 KB of float digits out of the JSON the /old page downloads whole.
 */
const SCORE_DECIMALS = 4;

/**
 * The corpus mean rating, weighted by review count.
 *
 * This is what a restaurant with no evidence of its own is assumed to be worth.
 * Weighted (4.3786) rather than a plain mean of ratings (4.2941), so a thin-data
 * restaurant is pulled towards what a typical *review* says rather than what a
 * typical *restaurant* says — the more conservative of the two.
 */
function reviewWeightedMeanRating(records: MergedRestaurant[]): number {
  let ratingTotal = 0;
  let reviewTotal = 0;

  for (const record of records) {
    ratingTotal += record.stars_count * record.reviews_count;
    reviewTotal += record.reviews_count;
  }

  return ratingTotal / reviewTotal;
}

/**
 * A Bayesian average of rating and review count — the IMDb Top 250 formula:
 *
 *       v                m
 *     ----- · R   +    ----- · C
 *     v + m            v + m
 *
 * R is the restaurant's own rating, v its review count, C the corpus mean and m
 * the confidence threshold. A rating with little evidence behind it sits near C
 * and earns its way up as reviews accumulate.
 *
 * Needed because neither source field can rank on its own, both tried on the
 * live index and both visibly wrong: desc(stars_count) ranked a 5.0 from three
 * reviews above a 4.8 from 1,018, and desc(reviews_count) lets volume beat
 * quality. Algolia cannot compute this for us — customRanking sorts a stored
 * attribute and there is no query-time scoring function — so the value has to
 * exist on the record before indexing.
 */
function popularityScore(
  record: MergedRestaurant,
  priorRating: number,
): number {
  const { stars_count: rating, reviews_count: reviews } = record;

  const confidence = reviews / (reviews + PRIOR_REVIEWS);
  const score = confidence * rating + (1 - confidence) * priorRating;

  const factor = 10 ** SCORE_DECIMALS;
  return Math.round(score * factor) / factor;
}
