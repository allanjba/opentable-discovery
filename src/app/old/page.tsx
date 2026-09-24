import { NaiveSearchApp } from "@/components/naive-search-app";

/**
 * The prospect's current experience, kept reachable for side-by-side comparison.
 * Substring matching over a 3.4 MB client-side download, no typo tolerance.
 */
export default function OldSearch() {
  return (
    <main className="flex-1">
      <NaiveSearchApp />
    </main>
  );
}
