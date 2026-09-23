import {
  SAMPLE_CUISINE_FACETS,
  SAMPLE_RESTAURANTS,
} from "@/lib/sample-data";

/**
 * Static layout only — nothing here is interactive yet.
 *
 * The purpose of this step is to confirm the skin matches the prospect's current
 * experience (full-version.png) before any data or search exists. The second
 * cuisine is shown as selected purely to check the active facet style.
 */
export default function Home() {
  const activeCuisine = SAMPLE_CUISINE_FACETS[1].value;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      {/* search bar */}
      <div className="bg-brand-dark p-6 shadow-md">
        <input
          type="search"
          disabled
          placeholder="Search for Restaurants by Name, Cuisine, Location"
          className="w-full bg-surface px-5 py-3 text-lg text-ink
                     placeholder:text-grey-400"
        />
      </div>

      <div className="flex flex-col bg-surface shadow-md sm:flex-row">
        {/* facet rail */}
        <aside className="w-full border-grey-200 p-6 sm:w-64 sm:shrink-0 sm:border-r">
          <h2 className="mb-4 font-semibold text-ink">Cuisine/Food Type</h2>
          <ul>
            {SAMPLE_CUISINE_FACETS.map((facet) => {
              const active = facet.value === activeCuisine;
              return (
                <li
                  key={facet.value}
                  className={`flex items-center justify-between px-3 py-1.5 text-[15px] ${
                    active ? "bg-brand text-white" : "text-ink"
                  }`}
                >
                  <span>{facet.value}</span>
                  <span className={active ? "text-white" : "text-grey-400"}>
                    {facet.count}
                  </span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* results */}
        <section className="min-w-0 flex-1 p-6">
          <div className="mb-6 flex items-baseline gap-2 border-b border-grey-200 pb-3">
            <span className="font-semibold text-ink">34 results found</span>
            <span className="text-sm text-grey-500">in 0.002 seconds</span>
          </div>

          <ul className="space-y-6">
            {SAMPLE_RESTAURANTS.map((restaurant) => (
              <li key={restaurant.objectID} className="flex gap-4">
                <div className="h-[86px] w-[110px] shrink-0 bg-grey-100" />
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-ink">
                    {restaurant.name}
                  </h3>
                  <p className="text-sm">
                    <span className="font-semibold text-accent">
                      {restaurant.stars_count.toFixed(1)}
                    </span>{" "}
                    <span className="text-grey-500">
                      ({restaurant.reviews_count.toLocaleString()} reviews)
                    </span>
                  </p>
                  <p className="truncate text-sm text-grey-500">
                    {restaurant.food_type} | {restaurant.neighborhood} |{" "}
                    {restaurant.price_range}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex justify-center">
            <button
              type="button"
              disabled
              className="border border-grey-300 px-10 py-2.5 text-ink"
            >
              Show More
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
