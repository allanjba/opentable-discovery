/**
 * Synonyms, shared by every index.
 *
 * They live here rather than in configure-index.mts because synonyms are
 * per-index and the autocomplete queries three. Applying them to `restaurants`
 * alone shipped a visible bug: "nyc" returned 1,415 restaurants while the
 * Locations section of the dropdown stayed empty, because the `locations` index
 * had never heard of the word.
 *
 * One list for all three is deliberate. A synonym only fires when its term
 * appears, so "bbq" against the locations index simply never matches — the cost
 * of sharing is nothing, and the cost of splitting is remembering to.
 *
 * Kept small on purpose. Every entry closes a gap that was measured first; an
 * unmeasured synonym is a rule nobody can justify a year later.
 *
 * Measured as NOT needing one, and therefore absent:
 *
 *   steak house  442   steakhouse  421   both already work
 *   barbeque      25   barbecue     25   typo tolerance covers it
 *   burger         7   burgers       7   plurals already handled
 *   tapas         54   small plates 43   the cuisine split already links them
 *   vegas         90   Las Vegas    88   already works
 *
 * `steak house` ↔ `steakhouse` sat on the roadmap from the start and would have
 * been dead weight. Also rejected after measuring: `la` (493 hits — two letters,
 * far too noisy) and `vegan` → `vegetarian` (one vegetarian restaurant in the
 * whole set, and "vegan" already mis-matches Las Vegas).
 */

import type { SynonymHit } from "algoliasearch";

export const SYNONYMS: SynonymHit[] = [
  {
    // The only alternate *spelling* this data actually needs. The catalogue
    // spells it "Barbecue" and nothing else, so a diner typing the everyday
    // abbreviation found 4 restaurants instead of 26.
    objectID: "bbq",
    type: "synonym",
    synonyms: ["bbq", "barbecue", "bar-b-q"],
  },

  /*
   * How people name places, one-way.
   *
   * One-way because "nyc" should find New York while "new york" gains nothing
   * from also matching "nyc" — the broader query is already right, and widening
   * it both ways only adds noise.
   *
   * "new york city" is the same problem wearing a different hat: the catalogue
   * stores the city as "New York", and Algolia requires every query word to
   * match, so the extra word sent the search to the 30 restaurants with "City"
   * in their name instead. Note this is NOT something removeWordsIfNoResults
   * would fix — that only fires at zero results, and this query returns 30.
   */
  { objectID: "nyc", type: "oneWaySynonym", input: "nyc", synonyms: ["new york"] },
  {
    objectID: "new-york-city",
    type: "oneWaySynonym",
    input: "new york city",
    synonyms: ["new york"],
  },
  { objectID: "sf", type: "oneWaySynonym", input: "sf", synonyms: ["san francisco"] },
  { objectID: "nola", type: "oneWaySynonym", input: "nola", synonyms: ["new orleans"] },
];
