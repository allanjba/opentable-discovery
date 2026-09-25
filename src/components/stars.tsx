/**
 * The five-star rating shown on a result card.
 *
 * Their current experience renders this and ours did not, which made the demo
 * visibly worse than the thing it replaces on that one element. Ratings are
 * continuous in this data (29 distinct values, 1.0 to 5.0), so half stars are
 * needed — 4.5 must not round up to five.
 *
 * Drawn with a clipped overlay rather than three separate glyphs: one row of
 * empty stars, one row of filled stars on top, clipped to the exact
 * percentage. That renders any fraction, not just halves, and avoids the
 * rounding artefacts of a half-star glyph.
 *
 * Everything here is a span rather than a div: this renders inside a <p>, and
 * a div is flow content, which closes the paragraph early. Display is set by
 * the utility classes, so spans behave identically.
 */

const STAR_PATH =
  "M12 2l2.9 6.2 6.6.9-4.8 4.7 1.2 6.7L12 17.3 6.1 20.5l1.2-6.7L2.5 9.1l6.6-.9L12 2z";

function Row({ className }: { className: string }) {
  return (
    <span className={`flex gap-px ${className}`} aria-hidden>
      {[0, 1, 2, 3, 4].map((index) => (
        <svg key={index} viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0">
          <path d={STAR_PATH} fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

export function Stars({ rating }: { rating: number }) {
  const percent = Math.max(0, Math.min(100, (rating / 5) * 100));

  return (
    <span
      className="relative inline-block align-middle"
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      <Row className="text-grey-200" />
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${percent}%` }}
      >
        <Row className="text-accent" />
      </span>
    </span>
  );
}
